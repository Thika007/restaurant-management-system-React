const { getConnection, sql } = require('../config/db');

const getCashEntries = async (req, res) => {
  try {
    const { branch, date, dateFrom, dateTo } = req.query;
    const pool = await getConnection();
    
    let query = 'SELECT * FROM CashEntries WHERE 1=1';
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
    
    res.json({ success: true, entries: result.recordset });
  } catch (error) {
    console.error('Get cash entries error:', error);
    res.status(500).json({ success: false, message: 'Error fetching cash entries' });
  }
};

const calculateExpectedCash = async (req, res) => {
  try {
    const { branch, date } = req.query;
    
    if (!branch || !date) {
      return res.status(400).json({ success: false, message: 'Branch and date are required' });
    }

    const pool = await getConnection();
    
    // Calculate from normal items (finished batches only)
    const stocksResult = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .input('itemType', sql.NVarChar, 'Normal Item')
      .query(`
        SELECT s.itemCode, s.added, s.returned, s.transferred, i.price, i.itemType
        FROM Stocks s
        INNER JOIN Items i ON s.itemCode = i.code
        INNER JOIN FinishedBatches f ON s.date = f.date AND s.branch = f.branch AND f.itemType = @itemType
        WHERE s.date = @date AND s.branch = @branch AND i.itemType = @itemType
      `);

    let expected = 0;
    stocksResult.recordset.forEach(stock => {
      const available = (stock.added || 0) - (stock.returned || 0) - (stock.transferred || 0);
      if (available > 0) {
        expected += available * parseFloat(stock.price);
      }
    });

    // Add grocery sales
    const groceryResult = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query('SELECT SUM(totalCash) as total FROM GrocerySales WHERE date = @date AND branch = @branch');

    expected += parseFloat(groceryResult.recordset[0].total || 0);

    // Add machine sales
    const machineResult = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query('SELECT SUM(totalCash) as total FROM MachineSales WHERE date = @date AND branch = @branch');

    expected += parseFloat(machineResult.recordset[0].total || 0);

    res.json({ success: true, expected: expected });
  } catch (error) {
    console.error('Calculate expected cash error:', error);
    res.status(500).json({ success: false, message: 'Error calculating expected cash' });
  }
};

const createCashEntry = async (req, res) => {
  try {
    const { branch, date, actualCash, cardPayment, notes, operatorId, operatorName } = req.body;
    
    if (!branch || !date || actualCash === undefined) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const pool = await getConnection();

    // Check for duplicate entry
    const duplicateCheck = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query('SELECT id FROM CashEntries WHERE date = @date AND branch = @branch');

    if (duplicateCheck.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Cash entry already exists for this date and branch' });
    }

    // Calculate expected cash using internal function
    const expected = await calculateExpectedCashInternal(pool, branch, date);

    if (expected <= 0) {
      return res.status(400).json({ success: false, message: 'No sales recorded for this branch and date' });
    }

    const actual = parseFloat(actualCash || 0) + parseFloat(cardPayment || 0);
    const difference = actual - expected;
    const status = difference === 0 ? 'Match' : difference > 0 ? 'Overage' : 'Shortage';

    await pool.request()
      .input('branch', sql.NVarChar, branch)
      .input('date', sql.Date, date)
      .input('expected', sql.Decimal(18, 2), expected)
      .input('actual', sql.Decimal(18, 2), actual)
      .input('actualCash', sql.Decimal(18, 2), actualCash)
      .input('cardPayment', sql.Decimal(18, 2), cardPayment || 0)
      .input('difference', sql.Decimal(18, 2), difference)
      .input('status', sql.NVarChar, status)
      .input('operatorId', sql.NVarChar, operatorId || null)
      .input('operatorName', sql.NVarChar, operatorName || null)
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        INSERT INTO CashEntries (branch, date, expected, actual, actualCash, cardPayment, difference, status, operatorId, operatorName, notes)
        VALUES (@branch, @date, @expected, @actual, @actualCash, @cardPayment, @difference, @status, @operatorId, @operatorName, @notes)
      `);

    res.json({ success: true, message: 'Cash entry created successfully' });
  } catch (error) {
    console.error('Create cash entry error:', error);
    res.status(500).json({ success: false, message: 'Error creating cash entry' });
  }
};

const calculateExpectedCashInternal = async (pool, branch, date) => {
  try {
    let expected = 0;

    const stocksResult = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .input('itemType', sql.NVarChar, 'Normal Item')
      .query(`
        SELECT s.itemCode, s.added, s.returned, s.transferred, i.price
        FROM Stocks s
        INNER JOIN Items i ON s.itemCode = i.code
        INNER JOIN FinishedBatches f ON s.date = f.date AND s.branch = f.branch AND f.itemType = @itemType
        WHERE s.date = @date AND s.branch = @branch AND i.itemType = @itemType
      `);

    stocksResult.recordset.forEach(stock => {
      const available = (stock.added || 0) - (stock.returned || 0) - (stock.transferred || 0);
      if (available > 0) {
        expected += available * parseFloat(stock.price);
      }
    });

    const groceryResult = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query('SELECT SUM(totalCash) as total FROM GrocerySales WHERE date = @date AND branch = @branch');

    expected += parseFloat(groceryResult.recordset[0].total || 0);

    const machineResult = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query('SELECT SUM(totalCash) as total FROM MachineSales WHERE date = @date AND branch = @branch');

    expected += parseFloat(machineResult.recordset[0].total || 0);

    return expected;
  } catch (error) {
    console.error('Calculate expected cash internal error:', error);
    return 0;
  }
};

module.exports = {
  getCashEntries,
  calculateExpectedCash,
  createCashEntry
};

