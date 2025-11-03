const { getConnection, sql } = require('../config/db');

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

    // Check if batch is finished
    const finishedResult = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query('SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch');

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
      available: Math.max(0, (s.added || 0) - (s.returned || 0) - (s.transferred || 0))
    }));

    res.json({ 
      success: true, 
      stocks,
      isFinished: finishedResult.recordset.length > 0 
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
              INSERT (date, branch, itemCode, added, returned, transferred, sold)
              VALUES (source.date, source.branch, source.itemCode, source.quantity, 0, 0, 0);
          `);
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

    // Mark batch as finished
    await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query(`
        IF NOT EXISTS (SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch)
        INSERT INTO FinishedBatches (date, branch) VALUES (@date, @branch)
      `);

    // Recalculate sold quantities
    await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query(`
        UPDATE Stocks 
        SET sold = (added - returned - transferred),
            updatedAt = GETDATE()
        WHERE date = @date AND branch = @branch
      `);

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

