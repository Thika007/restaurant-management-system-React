const { getConnection, sql } = require('../config/db');
const { createActivity } = require('./activitiesController');

const getTransfers = async (req, res) => {
  try {
    const { branch, dateFrom, dateTo } = req.query;
    const pool = await getConnection();
    
    let query = 'SELECT * FROM TransferHistory WHERE 1=1';
    const request = pool.request();
    
    if (branch) {
      query += ' AND (senderBranch = @branch OR receiverBranch = @branch)';
      request.input('branch', sql.NVarChar, branch);
    }
    if (dateFrom) {
      query += ' AND date >= @dateFrom';
      request.input('dateFrom', sql.Date, dateFrom);
    }
    if (dateTo) {
      query += ' AND date <= @dateTo';
      request.input('dateTo', sql.Date, dateTo);
    }
    
    query += ' ORDER BY processedAt DESC';
    const result = await request.query(query);
    
    const transfers = result.recordset.map(t => ({
      ...t,
      items: JSON.parse(t.items)
    }));
    
    res.json({ success: true, transfers });
  } catch (error) {
    console.error('Get transfers error:', error);
    res.status(500).json({ success: false, message: 'Error fetching transfers' });
  }
};

const createTransfer = async (req, res) => {
  try {
    const { date, senderBranch, receiverBranch, itemType, items, processedBy } = req.body;
    
    if (!date || !senderBranch || !receiverBranch || !itemType || !items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Invalid request data' });
    }

    if (senderBranch === receiverBranch) {
      return res.status(400).json({ success: false, message: 'Sender and receiver branches must be different' });
    }

    const pool = await getConnection();

    // Check if batches are finished for normal items
    if (itemType === 'Normal Item') {
      const senderCheck = await pool.request()
        .input('date', sql.Date, date)
        .input('branch', sql.NVarChar, senderBranch)
        .query('SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch');

      if (senderCheck.recordset.length > 0) {
        return res.status(400).json({ success: false, message: `Cannot transfer: ${senderBranch} has finished batch` });
      }

      const receiverCheck = await pool.request()
        .input('date', sql.Date, date)
        .input('branch', sql.NVarChar, receiverBranch)
        .query('SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch');

      if (receiverCheck.recordset.length > 0) {
        return res.status(400).json({ success: false, message: `Cannot transfer: ${receiverBranch} has finished batch` });
      }
    }

    if (itemType === 'Normal Item') {
      // Process normal item transfer
      for (const item of items) {
        // Update sender (reduce by transferred)
        await pool.request()
          .input('date', sql.Date, date)
          .input('branch', sql.NVarChar, senderBranch)
          .input('itemCode', sql.NVarChar, item.itemCode)
          .input('quantity', sql.Int, item.quantity)
          .query(`
            UPDATE Stocks 
            SET transferred = transferred + @quantity,
                sold = (added - returned - transferred),
                updatedAt = GETDATE()
            WHERE date = @date AND branch = @branch AND itemCode = @itemCode
          `);

        // Update receiver (add to added)
        await pool.request()
          .input('date', sql.Date, date)
          .input('branch', sql.NVarChar, receiverBranch)
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
    } else if (itemType === 'Grocery Item') {
      // Process grocery item transfer
      for (const item of items) {
        // Get sender stocks (FIFO)
        const senderStocks = await pool.request()
          .input('itemCode', sql.NVarChar, item.itemCode)
          .input('branch', sql.NVarChar, senderBranch)
          .query(`
            SELECT id, remaining, expiryDate, addedDate
            FROM GroceryStocks
            WHERE itemCode = @itemCode AND branch = @branch AND remaining > 0
            ORDER BY expiryDate ASC, addedDate ASC
          `);

        let remainingToTransfer = parseFloat(item.quantity);

        for (const stock of senderStocks.recordset) {
          if (remainingToTransfer <= 0) break;

          const transferQty = Math.min(parseFloat(stock.remaining), remainingToTransfer);
          
          // Reduce sender
          await pool.request()
            .input('id', sql.NVarChar, stock.id)
            .input('qty', sql.Decimal(18, 3), transferQty)
            .query('UPDATE GroceryStocks SET remaining = remaining - @qty WHERE id = @id');

          // Create receiver stock
          const receiverId = 'GROCERY_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          const receiverBatchId = 'B' + Date.now() + Math.random().toString(36).substr(2, 9);

          await pool.request()
            .input('id', sql.NVarChar, receiverId)
            .input('batchId', sql.NVarChar, receiverBatchId)
            .input('itemCode', sql.NVarChar, item.itemCode)
            .input('branch', sql.NVarChar, receiverBranch)
            .input('quantity', sql.Decimal(18, 3), transferQty)
            .input('remaining', sql.Decimal(18, 3), transferQty)
            .input('expiryDate', sql.Date, stock.expiryDate)
            .input('date', sql.Date, date)
            .input('addedDate', sql.Date, date)
            .query(`
              INSERT INTO GroceryStocks (id, batchId, itemCode, branch, quantity, remaining, expiryDate, date, addedDate)
              VALUES (@id, @batchId, @itemCode, @branch, @quantity, @remaining, @expiryDate, @date, @addedDate)
            `);

          remainingToTransfer -= transferQty;
        }
      }
    }

    // Record transfer history
    const transferId = 'TRANSFER_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    await pool.request()
      .input('id', sql.NVarChar, transferId)
      .input('date', sql.Date, date)
      .input('senderBranch', sql.NVarChar, senderBranch)
      .input('receiverBranch', sql.NVarChar, receiverBranch)
      .input('itemType', sql.NVarChar, itemType)
      .input('items', sql.NVarChar, JSON.stringify(items))
      .input('processedBy', sql.NVarChar, processedBy || null)
      .query(`
        INSERT INTO TransferHistory (id, date, senderBranch, receiverBranch, itemType, items, processedBy)
        VALUES (@id, @date, @senderBranch, @receiverBranch, @itemType, @items, @processedBy)
      `);

    // Log activities for transfers
    const activityTimestamp = new Date();
    
    // Get item names for better activity messages
    const itemCodes = items.map(i => i.itemCode);
    const itemsMap = {};
    
    // Fetch item names - use individual queries for each item code (safe and simple)
    if (itemCodes.length > 0) {
      for (const code of itemCodes) {
        if (!itemsMap[code]) {
          const itemResult = await pool.request()
            .input('code', sql.NVarChar, code)
            .query('SELECT code, name FROM Items WHERE code = @code');
          
          if (itemResult.recordset.length > 0) {
            itemsMap[code] = itemResult.recordset[0].name;
          }
        }
      }
    }

    // Log activity for each item transferred
    for (const item of items) {
      const itemName = itemsMap[item.itemCode] || item.itemCode;
      const quantity = item.quantity;
      
      // Log activity on sender branch (items sent out)
      await createActivity(
        'transfer',
        `${quantity} ${itemName} transferred from ${senderBranch} to ${receiverBranch}`,
        senderBranch,
        activityTimestamp,
        { 
          itemCode: item.itemCode, 
          itemName, 
          quantity, 
          senderBranch, 
          receiverBranch, 
          itemType, 
          date,
          direction: 'sent'
        },
        new Date(date) // realDate: the actual transfer date
      );

      // Log activity on receiver branch (items received)
      await createActivity(
        'transfer',
        `${quantity} ${itemName} received from ${senderBranch} to ${receiverBranch}`,
        receiverBranch,
        activityTimestamp,
        { 
          itemCode: item.itemCode, 
          itemName, 
          quantity, 
          senderBranch, 
          receiverBranch, 
          itemType, 
          date,
          direction: 'received'
        },
        new Date(date) // realDate: the actual transfer date
      );
    }

    res.json({ success: true, message: 'Transfer completed successfully' });
  } catch (error) {
    console.error('Create transfer error:', error);
    res.status(500).json({ success: false, message: 'Error processing transfer' });
  }
};

module.exports = {
  getTransfers,
  createTransfer
};

