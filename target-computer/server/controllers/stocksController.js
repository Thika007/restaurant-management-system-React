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
    const result = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query(`
        SELECT s.*, i.name as itemName, i.category, i.price, i.itemType
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
      .query('SELECT finishedAt FROM FinishedBatches WHERE date = @date AND branch = @branch');

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
      .query('SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch');

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

    // Check if batch is finished
    const finishedCheck = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query('SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch');

    if (finishedCheck.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Batch is already finished' });
    }

    // Get item names for activity logging
    const itemCodes = items.filter(i => i.quantity > 0).map(i => i.itemCode);
    let itemsMap = {};
    if (itemCodes.length > 0) {
      // Build parameterized query for item names
      const itemCodesStr = itemCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
      const itemsQuery = await pool.request()
        .query(`SELECT code, name FROM Items WHERE code IN (${itemCodesStr})`);
      
      itemsQuery.recordset.forEach(item => {
        itemsMap[item.code] = item.name;
      });
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
              UPDATE SET added = added + source.quantity, updatedAt = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (date, branch, itemCode, added, returned, transferred, sold, createdAt, updatedAt)
              VALUES (source.date, source.branch, source.itemCode, source.quantity, 0, 0, 0, GETDATE(), GETDATE());
          `);

        // Log activity for stock addition
        const itemName = itemsMap[item.itemCode] || item.itemCode;
        await createActivity(
          'stock_added',
          `${item.quantity} ${itemName} added to ${branch}`,
          branch,
          activityTimestamp,
          { itemCode: item.itemCode, quantity: item.quantity, date }
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

    // Mark batch as finished (explicitly set finishedAt timestamp)
    await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query(`
        IF NOT EXISTS (SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch)
        INSERT INTO FinishedBatches (date, branch, finishedAt) VALUES (@date, @branch, GETDATE())
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

    // Calculate total revenue for the batch finish activity
    const stocksResult = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query(`
        SELECT s.itemCode, s.added, s.returned, s.transferred, i.name as itemName, i.price
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
        { date, branch, totalRevenue }
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

    // Check if batch is finished
    const finishedCheck = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query('SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch');

    if (finishedCheck.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Batch is already finished' });
    }

    // Get item names for activity logging
    const itemCodes = items.filter(i => i.quantity > 0).map(i => i.itemCode);
    let itemsMap = {};
    if (itemCodes.length > 0) {
      const itemCodesStr = itemCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
      const itemsQuery = await pool.request()
        .query(`SELECT code, name FROM Items WHERE code IN (${itemCodesStr})`);
      
      itemsQuery.recordset.forEach(item => {
        itemsMap[item.code] = item.name;
      });
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
                sold = (added - returned - transferred),
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
          { itemCode: item.itemCode, quantity: item.quantity, date }
        );
      }
    }

    res.json({ success: true, message: 'Returns updated successfully' });
  } catch (error) {
    console.error('Update returns error:', error);
    res.status(500).json({ success: false, message: 'Error updating returns' });
  }
};

module.exports = {
  getStocks,
  getBatchStatus,
  updateStocks,
  finishBatch,
  updateReturns
};

