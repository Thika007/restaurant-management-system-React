const { getConnection, sql } = require('../config/db');

const getBatches = async (req, res) => {
  try {
    const { branch, date, status, machineCode } = req.query;
    const pool = await getConnection();
    
    let query = 'SELECT * FROM MachineBatches WHERE 1=1';
    const request = pool.request();
    
    if (branch) {
      query += ' AND branch = @branch';
      request.input('branch', sql.NVarChar, branch);
    }
    if (date) {
      query += ' AND date = @date';
      request.input('date', sql.Date, date);
    }
    if (status) {
      query += ' AND status = @status';
      request.input('status', sql.NVarChar, status);
    }
    if (machineCode) {
      query += ' AND machineCode = @machineCode';
      request.input('machineCode', sql.NVarChar, machineCode);
    }
    
    query += ' ORDER BY startTime DESC';
    const result = await request.query(query);
    
    res.json({ success: true, batches: result.recordset });
  } catch (error) {
    console.error('Get batches error:', error);
    res.status(500).json({ success: false, message: 'Error fetching batches' });
  }
};

const startBatch = async (req, res) => {
  try {
    const { machineCode, branch, startValue, date } = req.body;
    
    if (!machineCode || !branch || startValue === undefined || !date) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const pool = await getConnection();

    // Check for existing active batch
    const existingCheck = await pool.request()
      .input('machineCode', sql.NVarChar, machineCode)
      .input('branch', sql.NVarChar, branch)
      .input('status', sql.NVarChar, 'active')
      .query('SELECT id FROM MachineBatches WHERE machineCode = @machineCode AND branch = @branch AND status = @status');

    if (existingCheck.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Active batch already exists for this machine and branch' });
    }

    const id = 'B' + Date.now();
    
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('machineCode', sql.NVarChar, machineCode)
      .input('branch', sql.NVarChar, branch)
      .input('startValue', sql.Int, startValue)
      .input('date', sql.Date, date)
      .input('status', sql.NVarChar, 'active')
      .query(`
        INSERT INTO MachineBatches (id, machineCode, branch, startValue, date, status, startTime)
        VALUES (@id, @machineCode, @branch, @startValue, @date, @status, GETDATE())
      `);

    res.json({ success: true, message: 'Batch started successfully', batchId: id });
  } catch (error) {
    console.error('Start batch error:', error);
    res.status(500).json({ success: false, message: 'Error starting batch' });
  }
};

const updateBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { startValue, date, branch, machineCode } = req.body;
    
    const pool = await getConnection();

    // First verify the batch exists and belongs to the correct machine and branch
    const verifyResult = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT * FROM MachineBatches WHERE id = @id AND status = \'active\'');

    if (verifyResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Active batch not found' });
    }

    const batch = verifyResult.recordset[0];
    
    // If branch and machineCode are provided, verify they match
    if (branch && batch.branch !== branch) {
      return res.status(400).json({ success: false, message: 'Batch does not belong to the specified branch' });
    }
    
    if (machineCode && batch.machineCode !== machineCode) {
      return res.status(400).json({ success: false, message: 'Batch does not belong to the specified machine' });
    }

    // Update the batch
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('startValue', sql.Int, startValue)
      .input('date', sql.Date, date)
      .query(`
        UPDATE MachineBatches 
        SET startValue = @startValue, date = @date
        WHERE id = @id AND status = 'active'
      `);

    res.json({ success: true, message: 'Batch updated successfully' });
  } catch (error) {
    console.error('Update batch error:', error);
    res.status(500).json({ success: false, message: 'Error updating batch' });
  }
};

const finishBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { endValue } = req.body;
    
    if (endValue === undefined) {
      return res.status(400).json({ success: false, message: 'End value is required' });
    }

    const pool = await getConnection();

    // Get batch
    const batchResult = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT * FROM MachineBatches WHERE id = @id');

    if (batchResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }

    const batch = batchResult.recordset[0];

    if (parseInt(endValue) < batch.startValue) {
      return res.status(400).json({ success: false, message: 'End value cannot be less than start value' });
    }

    const soldQty = parseInt(endValue) - batch.startValue;

    // Get machine details
    const machineResult = await pool.request()
      .input('machineCode', sql.NVarChar, batch.machineCode)
      .query('SELECT name, price FROM Items WHERE code = @machineCode');

    if (machineResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Machine not found' });
    }

    const machine = machineResult.recordset[0];
    const totalCash = soldQty * parseFloat(machine.price);

    // Update batch
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('endValue', sql.Int, endValue)
      .input('status', sql.NVarChar, 'completed')
      .query(`
        UPDATE MachineBatches 
        SET endValue = @endValue, status = @status, endTime = GETDATE()
        WHERE id = @id
      `);

    // Record sale
    await pool.request()
      .input('machineCode', sql.NVarChar, batch.machineCode)
      .input('machineName', sql.NVarChar, machine.name)
      .input('date', sql.Date, batch.date)
      .input('branch', sql.NVarChar, batch.branch)
      .input('startValue', sql.Int, batch.startValue)
      .input('endValue', sql.Int, endValue)
      .input('soldQty', sql.Int, soldQty)
      .input('unitPrice', sql.Decimal(18, 2), machine.price)
      .input('totalCash', sql.Decimal(18, 2), totalCash)
      .query(`
        INSERT INTO MachineSales (machineCode, machineName, date, branch, startValue, endValue, soldQty, unitPrice, totalCash)
        VALUES (@machineCode, @machineName, @date, @branch, @startValue, @endValue, @soldQty, @unitPrice, @totalCash)
      `);

    res.json({ success: true, message: 'Batch completed successfully', soldQty, totalCash });
  } catch (error) {
    console.error('Finish batch error:', error);
    res.status(500).json({ success: false, message: 'Error finishing batch' });
  }
};

const getSales = async (req, res) => {
  try {
    const { branch, date, dateFrom, dateTo } = req.query;
    const pool = await getConnection();
    
    let query = 'SELECT * FROM MachineSales WHERE 1=1';
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
    console.error('Get sales error:', error);
    res.status(500).json({ success: false, message: 'Error fetching sales' });
  }
};

module.exports = {
  getBatches,
  startBatch,
  updateBatch,
  finishBatch,
  getSales
};

