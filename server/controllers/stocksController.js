const { getConnection, sql } = require('../config/db');
const { createActivity } = require('./activitiesController');

const getStocks = async (req, res) => {
  try {
    const { date, branch, itemType } = req.query;

    if (!date || !branch) {
      return res.status(400).json({ success: false, message: 'Date and branch are required' });
    }

    const pool = await getConnection();

    // Get stocks for the date and branch
    // Uses ItemPriceHistory subquery to get price that was valid on that date
    const stockRequest = pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch);
    if (itemType) {
      stockRequest.input('itemType', sql.NVarChar, itemType); // BUG-13 fix: bind param
    }
    const result = await stockRequest.query(`
        SELECT s.*, i.name as itemName, i.category, i.itemType,
               COALESCE(
                 (SELECT TOP 1 ph.price
                  FROM ItemPriceHistory ph
                  WHERE ph.itemCode = s.itemCode AND ph.effectiveFrom <= s.date
                  ORDER BY ph.effectiveFrom DESC),
                 i.price
               ) as price
        FROM Stocks s
        INNER JOIN Items i ON s.itemCode = i.code
        WHERE s.date = @date AND s.branch = @branch
        ${itemType ? `AND i.itemType = @itemType` : ''}
        ORDER BY i.name
      `);

    // Check if batch is finished and get finish timestamp
    const finishedResult = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .input('itemType', sql.NVarChar, 'Normal Item')
      .query('SELECT finishedAt FROM FinishedBatches WHERE date = @date AND branch = @branch AND itemType = @itemType');

    const stocks = result.recordset.map(s => ({
      itemCode: s.itemCode,
      itemName: s.itemName,
      category: s.category,
      price: parseFloat(s.price),
      itemType: s.itemType,
      added: s.added || 0,
      returned: s.returned || 0,
      transferred: s.transferred || 0,
      sold: s.sold || 0,
      available: Math.max(0, (s.added || 0) - (s.returned || 0) - (s.transferred || 0)),
      createdAt: s.createdAt ? (s.createdAt instanceof Date ? s.createdAt.toISOString() : new Date(s.createdAt).toISOString()) : null,
      updatedAt: s.updatedAt ? (s.updatedAt instanceof Date ? s.updatedAt.toISOString() : new Date(s.updatedAt).toISOString()) : null
    }));

    res.json({
      success: true,
      stocks,
      isFinished: finishedResult.recordset.length > 0,
      finishedAt: finishedResult.recordset.length > 0 && finishedResult.recordset[0].finishedAt
        ? (finishedResult.recordset[0].finishedAt instanceof Date
          ? finishedResult.recordset[0].finishedAt.toISOString()
          : new Date(finishedResult.recordset[0].finishedAt).toISOString())
        : null
    });
  } catch (error) {
    console.error('Get stocks error:', error);
    res.status(500).json({ success: false, message: 'Error fetching stocks' });
  }
};

const getBatchStatus = async (req, res) => {
  try {
    const { date, branch } = req.query;
    const pool = await getConnection();

    const result = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .input('itemType', sql.NVarChar, 'Normal Item')
      .query('SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch AND itemType = @itemType');

    res.json({ success: true, isFinished: result.recordset.length > 0 });
  } catch (error) {
    console.error('Get batch status error:', error);
    res.status(500).json({ success: false, message: 'Error checking batch status' });
  }
};

const updateStocks = async (req, res) => {
  try {
    const { date, branch, items } = req.body; // items: [{ itemCode, quantity }]

    if (!date || !branch || !items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Invalid request data' });
    }

    const pool = await getConnection();

    // Prevent entering a future date when previous date (with data) is not finished.
    // Rule: If there is any previous Normal Item date for this branch with stock data,
    // that date must be finished in Add Return before allowing a later date.
    const prevUnfinished = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query(`
        WITH prev AS (
          SELECT MAX([date]) AS prevDate
          FROM Stocks
          WHERE branch = @branch
            AND [date] < @date
            AND (ISNULL(added,0) > 0 OR ISNULL(returned,0) > 0 OR ISNULL(transferred,0) > 0)
        )
        SELECT p.prevDate
        FROM prev p
        WHERE p.prevDate IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM FinishedBatches fb
            WHERE fb.[date] = p.prevDate AND fb.branch = @branch AND fb.itemType = 'Normal Item'
          );
      `);
    if (prevUnfinished.recordset?.[0]?.prevDate) {
      const d = new Date(prevUnfinished.recordset[0].prevDate).toISOString().split('T')[0];
      return res.status(400).json({
        success: false,
        message: `⚠️ Please finish the previous day first.\n\nBranch: ${branch}\nPending date: ${d}\n\nGo to Add Return Stock page and click Finish for ${d}. Then you can enter data for ${date}.`
      });
    }

    // Check if batch is finished for Normal Items
    const finishedCheck = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .input('itemType', sql.NVarChar, 'Normal Item')
      .query('SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch AND itemType = @itemType');

    if (finishedCheck.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Batch is already finished' });
    }

    // Get item names for activity logging (BUG-10 fix: parameterized queries, no string concat)
    const itemCodes = items.filter(i => i.quantity > 0).map(i => i.itemCode);
    let itemsMap = {};
    for (const code of itemCodes) {
      const r = await pool.request()
        .input('code', sql.NVarChar, code)
        .query('SELECT code, name FROM Items WHERE code = @code');
      if (r.recordset.length > 0) itemsMap[r.recordset[0].code] = r.recordset[0].name;
    }

    const activityTimestamp = new Date(); // Use current timestamp for accurate activity logging

    for (const item of items) {
      if (item.quantity > 0) {
        // Use MERGE (UPSERT) to handle both insert and update
        await pool.request()
          .input('date', sql.Date, date)
          .input('branch', sql.NVarChar, branch)
          .input('itemCode', sql.NVarChar, item.itemCode)
          .input('quantity', sql.Int, item.quantity)
          .query(`
            MERGE Stocks AS target
            USING (SELECT @date AS date, @branch AS branch, @itemCode AS itemCode, @quantity AS quantity) AS source
            ON target.date = source.date AND target.branch = source.branch AND target.itemCode = source.itemCode
            WHEN MATCHED THEN
              UPDATE SET added = added + source.quantity,
                         sold = ISNULL(added, 0) + source.quantity - ISNULL(returned, 0) - ISNULL(transferred, 0), 
                         updatedAt = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (date, branch, itemCode, added, returned, transferred, sold, createdAt, updatedAt)
              VALUES (source.date, source.branch, source.itemCode, source.quantity, 0, 0, source.quantity, GETDATE(), GETDATE());
          `);

        // Log activity for stock addition
        const itemName = itemsMap[item.itemCode] || item.itemCode;
        await createActivity(
          'stock_added',
          `${item.quantity} ${itemName} added to ${branch}`,
          branch,
          activityTimestamp,
          { itemCode: item.itemCode, quantity: item.quantity, date },
          new Date(date) // realDate: the actual stock date
        );
      }
    }

    res.json({ success: true, message: 'Stocks updated successfully' });
  } catch (error) {
    console.error('Update stocks error:', error);
    res.status(500).json({ success: false, message: 'Error updating stocks' });
  }
};

const finishBatch = async (req, res) => {
  try {
    const { date, branch } = req.body;

    if (!date || !branch) {
      return res.status(400).json({ success: false, message: 'Date and branch are required' });
    }

    const pool = await getConnection();
    const finishTimestamp = new Date(); // Use current timestamp for accurate activity logging

    // Check if already finished for Normal Items
    const checkResult = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .input('itemType', sql.NVarChar, 'Normal Item')
      .query('SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch AND itemType = @itemType');

    if (checkResult.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Batch is already finished' });
    }

    // Mark batch as finished for Normal Items
    await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .input('itemType', sql.NVarChar, 'Normal Item')
      .query(`
        INSERT INTO FinishedBatches (date, branch, itemType, finishedAt) 
        VALUES (@date, @branch, @itemType, GETDATE())
      `);

    // Recalculate sold quantities (don't update updatedAt - we're not modifying stock, just recalculating)
    await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query(`
        UPDATE Stocks 
        SET sold = (added - returned - transferred)
        WHERE date = @date AND branch = @branch
      `);

    // Calculate total revenue for the batch finish activity (BUG-03 fix: use ItemPriceHistory)
    const stocksResult = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query(`
        SELECT s.itemCode, s.added, s.returned, s.transferred, i.name as itemName,
               COALESCE(
                 (SELECT TOP 1 ph.price
                  FROM ItemPriceHistory ph
                  WHERE ph.itemCode = s.itemCode AND ph.effectiveFrom <= @date
                  ORDER BY ph.effectiveFrom DESC),
                 i.price
               ) as price
        FROM Stocks s
        INNER JOIN Items i ON s.itemCode = i.code
        WHERE s.date = @date AND s.branch = @branch
      `);

    let totalRevenue = 0;
    for (const stock of stocksResult.recordset) {
      const soldQty = Math.max(0, (stock.added || 0) - (stock.returned || 0) - (stock.transferred || 0));
      const revenue = soldQty * (stock.price || 0);
      totalRevenue += revenue;
    }

    // Log activity for batch finish
    if (totalRevenue > 0) {
      await createActivity(
        'batch_finished_sale',
        `Batch finished at ${branch}: Total Revenue Rs ${totalRevenue.toFixed(2)}`,
        branch,
        finishTimestamp,
        { date, branch, totalRevenue },
        new Date(date) // realDate: the actual batch date
      );
    }

    res.json({ success: true, message: 'Batch finished successfully' });
  } catch (error) {
    console.error('Finish batch error:', error);
    res.status(500).json({ success: false, message: 'Error finishing batch' });
  }
};

const updateReturns = async (req, res) => {
  try {
    const { date, branch, items } = req.body; // items: [{ itemCode, quantity }]

    if (!date || !branch || !items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Invalid request data' });
    }

    const pool = await getConnection();

    // Prevent entering a later date when previous Normal Item date (with data) is not finished.
    const prevUnfinished = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query(`
        WITH prev AS (
          SELECT MAX([date]) AS prevDate
          FROM Stocks
          WHERE branch = @branch
            AND [date] < @date
            AND (ISNULL(added,0) > 0 OR ISNULL(returned,0) > 0 OR ISNULL(transferred,0) > 0)
        )
        SELECT p.prevDate
        FROM prev p
        WHERE p.prevDate IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM FinishedBatches fb
            WHERE fb.[date] = p.prevDate AND fb.branch = @branch AND fb.itemType = 'Normal Item'
          );
      `);
    if (prevUnfinished.recordset?.[0]?.prevDate) {
      const d = new Date(prevUnfinished.recordset[0].prevDate).toISOString().split('T')[0];
      return res.status(400).json({
        success: false,
        message: `⚠️ Please finish the previous day first.\n\nBranch: ${branch}\nPending date: ${d}\n\nFinish ${d} in Add Return Stock page (Normal Items). Then you can enter data for ${date}.`
      });
    }

    // Check if batch is finished for Normal Items
    const finishedCheck = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .input('itemType', sql.NVarChar, 'Normal Item')
      .query('SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch AND itemType = @itemType');

    if (finishedCheck.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Batch is already finished' });
    }

    // Get item names for activity logging (BUG-10 fix: parameterized queries, no string concat)
    const itemCodes = items.filter(i => i.quantity > 0).map(i => i.itemCode);
    let itemsMap = {};
    for (const code of itemCodes) {
      const r = await pool.request()
        .input('code', sql.NVarChar, code)
        .query('SELECT code, name FROM Items WHERE code = @code');
      if (r.recordset.length > 0) itemsMap[r.recordset[0].code] = r.recordset[0].name;
    }

    const activityTimestamp = new Date(); // Use current timestamp for accurate activity logging

    for (const item of items) {
      if (item.quantity > 0) {
        // Check available stock
        const stockCheck = await pool.request()
          .input('date', sql.Date, date)
          .input('branch', sql.NVarChar, branch)
          .input('itemCode', sql.NVarChar, item.itemCode)
          .query('SELECT added, returned, transferred FROM Stocks WHERE date = @date AND branch = @branch AND itemCode = @itemCode');

        if (stockCheck.recordset.length > 0) {
          const stock = stockCheck.recordset[0];
          const available = (stock.added || 0) - (stock.returned || 0) - (stock.transferred || 0);

          if (item.quantity > available) {
            return res.status(400).json({
              success: false,
              message: `Cannot return ${item.quantity}. Only ${available} available for item ${item.itemCode}`
            });
          }
        }

        await pool.request()
          .input('date', sql.Date, date)
          .input('branch', sql.NVarChar, branch)
          .input('itemCode', sql.NVarChar, item.itemCode)
          .input('quantity', sql.Int, item.quantity)
          .query(`
            UPDATE Stocks 
            SET returned = returned + @quantity,
                sold = ISNULL(added, 0) - (ISNULL(returned, 0) + @quantity) - ISNULL(transferred, 0),
                updatedAt = GETDATE()
            WHERE date = @date AND branch = @branch AND itemCode = @itemCode
          `);

        // Log activity for stock return
        const itemName = itemsMap[item.itemCode] || item.itemCode;
        await createActivity(
          'return',
          `${item.quantity} ${itemName} returned at ${branch}`,
          branch,
          activityTimestamp,
          { itemCode: item.itemCode, quantity: item.quantity, date },
          new Date(date) // realDate: the actual stock date
        );
      }
    }

    res.json({ success: true, message: 'Returns updated successfully' });
  } catch (error) {
    console.error('Update returns error:', error);
    res.status(500).json({ success: false, message: 'Error updating returns' });
  }
};

// ---------------------------------------------------------------------------
// BATCH endpoint: fetch all stocks for a date range + multiple branches in
// ONE SQL query instead of calling /stocks once per date×branch combination.
// This fixes the N×M sequential API call performance problem in Dashboard/Reports.
// ---------------------------------------------------------------------------
const getStocksRange = async (req, res) => {
  try {
    const { dateFrom, dateTo, branches, itemType } = req.query;

    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, message: 'dateFrom and dateTo are required' });
    }

    const pool = await getConnection();
    const request = pool.request()
      .input('dateFrom', sql.Date, dateFrom)
      .input('dateTo', sql.Date, dateTo);

    // Build optional filters
    let branchFilter = '';
    if (branches) {
      // branches passed as comma-separated e.g. "Branch1,Branch2"
      const branchList = branches.split(',').map(b => b.trim()).filter(Boolean);
      if (branchList.length === 1) {
        request.input('branch', sql.NVarChar, branchList[0]);
        branchFilter = 'AND s.branch = @branch';
      } else if (branchList.length > 1) {
        // Parameterize each branch safely
        const placeholders = branchList.map((b, i) => {
          request.input(`branch${i}`, sql.NVarChar, b);
          return `@branch${i}`;
        }).join(',');
        branchFilter = `AND s.branch IN (${placeholders})`;
      }
    }

    let itemTypeFilter = '';
    if (itemType) {
      request.input('itemType', sql.NVarChar, itemType);
      itemTypeFilter = 'AND i.itemType = @itemType';
    }

    // Single SQL call for the entire date range (replaces N×M loop)
    const stocksResult = await request.query(`
      SELECT
        s.date, s.branch, s.itemCode,
        s.added, s.returned, s.transferred, s.sold,
        i.name as itemName, i.category, i.itemType,
        COALESCE(
          (SELECT TOP 1 ph.price
           FROM ItemPriceHistory ph
           WHERE ph.itemCode = s.itemCode AND ph.effectiveFrom <= s.date
           ORDER BY ph.effectiveFrom DESC),
          i.price
        ) as price
      FROM Stocks s
      INNER JOIN Items i ON s.itemCode = i.code
      WHERE s.date >= @dateFrom AND s.date <= @dateTo
      ${branchFilter}
      ${itemTypeFilter}
      ORDER BY s.date, s.branch, i.name
    `);

    // Get finished batches for the range (Normal Items)
    const finishedResult = await request.query(`
      SELECT date, branch, finishedAt
      FROM FinishedBatches
      WHERE date >= @dateFrom AND date <= @dateTo
      AND itemType = 'Normal Item'
      ${branchFilter}
    `);

    // Build a lookup map: "YYYY-MM-DD|branch" => isFinished
    const finishedMap = {};
    for (const fb of finishedResult.recordset) {
      const key = `${fb.date instanceof Date ? fb.date.toISOString().split('T')[0] : fb.date}|${fb.branch}`;
      finishedMap[key] = true;
    }

    // Group stocks by date+branch, attach isFinished flag
    const grouped = {};
    for (const s of stocksResult.recordset) {
      const dateStr = s.date instanceof Date ? s.date.toISOString().split('T')[0] : s.date;
      const key = `${dateStr}|${s.branch}`;
      if (!grouped[key]) {
        grouped[key] = {
          date: dateStr,
          branch: s.branch,
          isFinished: !!finishedMap[key],
          stocks: []
        };
      }
      grouped[key].stocks.push({
        itemCode: s.itemCode,
        itemName: s.itemName,
        category: s.category,
        price: parseFloat(s.price || 0),
        itemType: s.itemType,
        added: s.added || 0,
        returned: s.returned || 0,
        transferred: s.transferred || 0,
        sold: s.sold || 0,
        available: Math.max(0, (s.added || 0) - (s.returned || 0) - (s.transferred || 0))
      });
    }

    res.json({ success: true, data: Object.values(grouped) });
  } catch (error) {
    console.error('Get stocks range error:', error);
    res.status(500).json({ success: false, message: 'Error fetching stocks range' });
  }
};

module.exports = {
  getStocks,
  getBatchStatus,
  updateStocks,
  finishBatch,
  updateReturns,
  getStocksRange
};

