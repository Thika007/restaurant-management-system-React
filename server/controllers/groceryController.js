const { getConnection, sql } = require('../config/db');
const { checkExpiringItems } = require('./notificationsController');

const generateBatchId = () => 'B' + Date.now() + Math.random().toString(36).substr(2, 9);
const generateId = () => 'GROCERY_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

const getGroceryStocks = async (req, res) => {
  try {
    const { branch, itemCode } = req.query;
    const pool = await getConnection();
    
    let query = 'SELECT * FROM GroceryStocks WHERE 1=1';
    const request = pool.request();
    
    if (branch) {
      query += ' AND branch = @branch';
      request.input('branch', sql.NVarChar, branch);
    }
    if (itemCode) {
      query += ' AND itemCode = @itemCode';
      request.input('itemCode', sql.NVarChar, itemCode);
    }
    
    query += ' ORDER BY addedDate DESC, expiryDate ASC';
    const result = await request.query(query);
    
    // Remove batchId from response - not needed for frontend
    const stocks = result.recordset.map(stock => {
      const { batchId, ...stockWithoutBatchId } = stock;
      return stockWithoutBatchId;
    });
    
    res.json({ success: true, stocks });
  } catch (error) {
    console.error('Get grocery stocks error:', error);
    res.status(500).json({ success: false, message: 'Error fetching grocery stocks' });
  }
};

const addGroceryStock = async (req, res) => {
  try {
    const { itemCode, branch, quantity, expiryDate, date } = req.body;
    
    if (!itemCode || !branch || !quantity || !expiryDate) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const pool = await getConnection();
    const id = generateId();
    const batchId = generateBatchId();
    const stockDate = date || new Date().toISOString().split('T')[0];

    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('batchId', sql.NVarChar, batchId)
      .input('itemCode', sql.NVarChar, itemCode)
      .input('branch', sql.NVarChar, branch)
      .input('quantity', sql.Decimal(18, 3), quantity)
      .input('remaining', sql.Decimal(18, 3), quantity)
      .input('expiryDate', sql.Date, expiryDate)
      .input('date', sql.Date, stockDate)
      .input('addedDate', sql.Date, stockDate)
      .query(`
        INSERT INTO GroceryStocks (id, batchId, itemCode, branch, quantity, remaining, expiryDate, date, addedDate)
        VALUES (@id, @batchId, @itemCode, @branch, @quantity, @remaining, @expiryDate, @date, @addedDate)
      `);

    // Check for expiring items and create notifications
    try {
      console.log(`[Add Stock] Stock added for item ${itemCode}, expiry: ${expiryDate}, checking for expiring items...`);
      const result = await checkExpiringItems();
      console.log(`[Add Stock] Expiry check result:`, result);
    } catch (error) {
      console.error('[Add Stock] Error checking expiring items after stock addition:', error);
      // Don't fail the request if notification check fails
    }

    res.json({ success: true, message: 'Grocery stock added successfully' });
  } catch (error) {
    console.error('Add grocery stock error:', error);
    res.status(500).json({ success: false, message: 'Error adding grocery stock' });
  }
};

const getGrocerySales = async (req, res) => {
  try {
    const { branch, date, dateFrom, dateTo } = req.query;
    const pool = await getConnection();
    
    let query = 'SELECT * FROM GrocerySales WHERE 1=1';
    const request = pool.request();
    
    if (branch) {
      query += ' AND branch = @branch';
      request.input('branch', sql.NVarChar, branch);
    }
    if (date) {
      query += ' AND date = @date';
      request.input('date', sql.Date, date);
    }
    if (dateFrom) {
      query += ' AND date >= @dateFrom';
      request.input('dateFrom', sql.Date, dateFrom);
    }
    if (dateTo) {
      query += ' AND date <= @dateTo';
      request.input('dateTo', sql.Date, dateTo);
    }
    
    query += ' ORDER BY date DESC, timestamp DESC';
    const result = await request.query(query);
    
    res.json({ success: true, sales: result.recordset });
  } catch (error) {
    console.error('Get grocery sales error:', error);
    res.status(500).json({ success: false, message: 'Error fetching grocery sales' });
  }
};

const recordGrocerySale = async (req, res) => {
  try {
    const { itemCode, itemName, branch, date, soldQty, totalCash } = req.body;
    
    if (!itemCode || !branch || !date || !soldQty) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const pool = await getConnection();

    await pool.request()
      .input('itemCode', sql.NVarChar, itemCode)
      .input('itemName', sql.NVarChar, itemName)
      .input('branch', sql.NVarChar, branch)
      .input('date', sql.Date, date)
      .input('soldQty', sql.Decimal(18, 3), soldQty)
      .input('totalCash', sql.Decimal(18, 2), totalCash || 0)
      .query(`
        INSERT INTO GrocerySales (itemCode, itemName, branch, date, soldQty, totalCash)
        VALUES (@itemCode, @itemName, @branch, @date, @soldQty, @totalCash)
      `);

    res.json({ success: true, message: 'Grocery sale recorded successfully' });
  } catch (error) {
    console.error('Record grocery sale error:', error);
    res.status(500).json({ success: false, message: 'Error recording grocery sale' });
  }
};

const getGroceryReturns = async (req, res) => {
  try {
    const { branch, date, dateFrom, dateTo } = req.query;
    const pool = await getConnection();
    
    let query = 'SELECT * FROM GroceryReturns WHERE 1=1';
    const request = pool.request();
    
    if (branch) {
      query += ' AND branch = @branch';
      request.input('branch', sql.NVarChar, branch);
    }
    if (date) {
      query += ' AND date = @date';
      request.input('date', sql.Date, date);
    }
    if (dateFrom) {
      query += ' AND date >= @dateFrom';
      request.input('dateFrom', sql.Date, dateFrom);
    }
    if (dateTo) {
      query += ' AND date <= @dateTo';
      request.input('dateTo', sql.Date, dateTo);
    }
    
    query += ' ORDER BY date DESC';
    const result = await request.query(query);
    
    res.json({ success: true, returns: result.recordset });
  } catch (error) {
    console.error('Get grocery returns error:', error);
    res.status(500).json({ success: false, message: 'Error fetching grocery returns' });
  }
};

const recordGroceryReturn = async (req, res) => {
  try {
    const { itemCode, itemName, branch, date, returnedQty, reason } = req.body;
    
    if (!itemCode || !branch || !date || !returnedQty) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const pool = await getConnection();

    // Reduce remaining stock (FIFO)
    const stocks = await pool.request()
      .input('itemCode', sql.NVarChar, itemCode)
      .input('branch', sql.NVarChar, branch)
      .query(`
        SELECT id, remaining 
        FROM GroceryStocks 
        WHERE itemCode = @itemCode AND branch = @branch AND remaining > 0
        ORDER BY expiryDate ASC, addedDate ASC
      `);

    let remainingToReturn = parseFloat(returnedQty);
    
    for (const stock of stocks.recordset) {
      if (remainingToReturn <= 0) break;
      const deduct = Math.min(parseFloat(stock.remaining), remainingToReturn);
      
      await pool.request()
        .input('id', sql.NVarChar, stock.id)
        .input('deduct', sql.Decimal(18, 3), deduct)
        .query('UPDATE GroceryStocks SET remaining = remaining - @deduct WHERE id = @id');
      
      remainingToReturn -= deduct;
    }

    // Record return
    await pool.request()
      .input('itemCode', sql.NVarChar, itemCode)
      .input('itemName', sql.NVarChar, itemName)
      .input('branch', sql.NVarChar, branch)
      .input('date', sql.Date, date)
      .input('returnedQty', sql.Decimal(18, 3), returnedQty)
      .input('reason', sql.NVarChar, reason || 'waste')
      .query(`
        INSERT INTO GroceryReturns (itemCode, itemName, branch, date, returnedQty, reason)
        VALUES (@itemCode, @itemName, @branch, @date, @returnedQty, @reason)
      `);

    res.json({ success: true, message: 'Grocery return recorded successfully' });
  } catch (error) {
    console.error('Record grocery return error:', error);
    res.status(500).json({ success: false, message: 'Error recording grocery return' });
  }
};

const updateGroceryRemaining = async (req, res) => {
  try {
    const { branch, updates } = req.body; // updates: [{ itemCode, newRemaining }]
    
    if (!branch || !updates || !Array.isArray(updates)) {
      return res.status(400).json({ success: false, message: 'Invalid request data' });
    }

    const pool = await getConnection();

    for (const update of updates) {
      // Get current stocks for this item and branch
      const stocks = await pool.request()
        .input('itemCode', sql.NVarChar, update.itemCode)
        .input('branch', sql.NVarChar, branch)
        .query(`
          SELECT id, remaining, quantity 
          FROM GroceryStocks 
          WHERE itemCode = @itemCode AND branch = @branch
          ORDER BY expiryDate ASC, addedDate ASC
        `);

      const totalRemaining = stocks.recordset.reduce((sum, s) => sum + parseFloat(s.remaining || s.quantity), 0);
      const newRemaining = parseFloat(update.newRemaining);
      const soldQty = totalRemaining - newRemaining;

      if (soldQty < 0) {
        return res.status(400).json({ 
          success: false, 
          message: `New remaining (${newRemaining}) cannot be greater than current stock (${totalRemaining})` 
        });
      }

      // Update stocks to match new remaining (distribute proportionally or FIFO)
      let remainingToUpdate = newRemaining;
      for (const stock of stocks.recordset) {
        const currentRemaining = parseFloat(stock.remaining || stock.quantity);
        const proportion = currentRemaining / totalRemaining;
        const newStockRemaining = Math.max(0, Math.min(currentRemaining, remainingToUpdate * proportion));
        
        await pool.request()
          .input('id', sql.NVarChar, stock.id)
          .input('remaining', sql.Decimal(18, 3), newStockRemaining)
          .query('UPDATE GroceryStocks SET remaining = @remaining WHERE id = @id');
        
        remainingToUpdate -= newStockRemaining;
        if (remainingToUpdate <= 0) break;
      }

      // Record sale if soldQty > 0
      if (soldQty > 0) {
        const itemResult = await pool.request()
          .input('itemCode', sql.NVarChar, update.itemCode)
          .query('SELECT name, price FROM Items WHERE code = @itemCode');
        
        if (itemResult.recordset.length > 0) {
          const item = itemResult.recordset[0];
          const today = new Date().toISOString().split('T')[0];
          
          await pool.request()
            .input('itemCode', sql.NVarChar, update.itemCode)
            .input('itemName', sql.NVarChar, item.name)
            .input('branch', sql.NVarChar, branch)
            .input('date', sql.Date, today)
            .input('soldQty', sql.Decimal(18, 3), soldQty)
            .input('totalCash', sql.Decimal(18, 2), soldQty * parseFloat(item.price))
            .query(`
              INSERT INTO GrocerySales (itemCode, itemName, branch, date, soldQty, totalCash)
              VALUES (@itemCode, @itemName, @branch, @date, @soldQty, @totalCash)
            `);
        }
      }
    }

    res.json({ success: true, message: 'Grocery remaining updated successfully' });
  } catch (error) {
    console.error('Update grocery remaining error:', error);
    res.status(500).json({ success: false, message: 'Error updating grocery remaining' });
  }
};

module.exports = {
  getGroceryStocks,
  addGroceryStock,
  getGrocerySales,
  recordGrocerySale,
  getGroceryReturns,
  recordGroceryReturn,
  updateGroceryRemaining
};

