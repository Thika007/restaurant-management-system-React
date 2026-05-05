const { getConnection, sql } = require('../config/db');
const { createActivity } = require('./activitiesController');

const getTransfers = async (req, res) => {
  try {
    const { branch, dateFrom, dateTo } = req.query;
    const pool = await getConnection();

    let query = `
      SELECT id, date, senderBranch, receiverBranch, itemType, items, processedBy, processedAt
      FROM TransferHistory WHERE 1=1
    `;
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
      items: typeof t.items === 'string' ? JSON.parse(t.items) : t.items
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

    if (!items.length) {
      return res.status(400).json({ success: false, message: 'No items specified for transfer' });
    }

    const pool = await getConnection();

    // ──────────────────────────────────────────────
    // PRE-FLIGHT CHECKS (before starting transaction)
    // ──────────────────────────────────────────────

    if (itemType === 'Normal Item') {
      // BUG-T01 pre-check: batch finished for sender?
      const senderCheck = await pool.request()
        .input('date', sql.Date, date)
        .input('branch', sql.NVarChar, senderBranch)
        .input('itemType', sql.NVarChar, 'Normal Item')
        .query('SELECT 1 FROM FinishedBatches WHERE date = @date AND branch = @branch AND itemType = @itemType');
      if (senderCheck.recordset.length > 0) {
        return res.status(400).json({ success: false, message: `Cannot transfer: ${senderBranch} batch is already finished for ${date}` });
      }

      // BUG-T01 pre-check: batch finished for receiver?
      const receiverCheck = await pool.request()
        .input('date', sql.Date, date)
        .input('branch', sql.NVarChar, receiverBranch)
        .input('itemType', sql.NVarChar, 'Normal Item')
        .query('SELECT 1 FROM FinishedBatches WHERE date = @date AND branch = @branch AND itemType = @itemType');
      if (receiverCheck.recordset.length > 0) {
        return res.status(400).json({ success: false, message: `Cannot transfer: ${receiverBranch} batch is already finished for ${date}` });
      }

      // BUG-T02 pre-check: validate sender has enough stock for ALL items before touching anything
      for (const item of items) {
        const senderStock = await pool.request()
          .input('date', sql.Date, date)
          .input('branch', sql.NVarChar, senderBranch)
          .input('itemCode', sql.NVarChar, item.itemCode)
          .query('SELECT added, returned, transferred FROM Stocks WHERE date = @date AND branch = @branch AND itemCode = @itemCode');

        if (senderStock.recordset.length === 0) {
          return res.status(400).json({ success: false, message: `No stock record for item ${item.itemCode} at ${senderBranch} on ${date}` });
        }
        const s = senderStock.recordset[0];
        const available = (s.added || 0) - (s.returned || 0) - (s.transferred || 0);
        if (item.quantity > available) {
          return res.status(400).json({ success: false, message: `Cannot transfer ${item.quantity} of ${item.itemCode}. Only ${available} available at ${senderBranch}.` });
        }
      }
    }

    if (itemType === 'Grocery Item') {
      // BUG-T04 fix: check if receiver grocery batch is already finished
      const receiverGroceryCheck = await pool.request()
        .input('date', sql.Date, date)
        .input('branch', sql.NVarChar, receiverBranch)
        .input('itemType', sql.NVarChar, 'Grocery Item')
        .query('SELECT 1 FROM FinishedBatches WHERE date = @date AND branch = @branch AND itemType = @itemType');
      if (receiverGroceryCheck.recordset.length > 0) {
        return res.status(400).json({ success: false, message: `Cannot transfer: ${receiverBranch} grocery batch is already finished for ${date}` });
      }

      // BUG-T07/T02 pre-check: validate sender grocery stock for ALL items
      for (const item of items) {
        const senderStocks = await pool.request()
          .input('itemCode', sql.NVarChar, item.itemCode)
          .input('branch', sql.NVarChar, senderBranch)
          .query(`
            SELECT id, remaining, expiryDate, addedDate
            FROM GroceryStocks
            WHERE itemCode = @itemCode AND branch = @branch AND remaining > 0
            ORDER BY expiryDate ASC, addedDate ASC
          `);

        const totalAvailable = senderStocks.recordset.reduce((sum, s) => sum + parseFloat(s.remaining || 0), 0);
        if (parseFloat(item.quantity) > totalAvailable + 0.001) {
          return res.status(400).json({
            success: false,
            message: `Cannot transfer ${item.quantity} of ${item.itemCode}. Only ${totalAvailable.toFixed(3)} available at ${senderBranch}.`
          });
        }
        // Cache for use inside transaction
        item._senderStocks = senderStocks.recordset;
      }
    }

    // ──────────────────────────────────────────────
    // BUG-T01 FIX: Run all stock mutations inside a DB transaction
    // If anything fails, ALL changes are rolled back (no partial transfers)
    // ──────────────────────────────────────────────
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      if (itemType === 'Normal Item') {
        for (const item of items) {
          // Reduce sender transferred count
          await transaction.request()
            .input('date', sql.Date, date)
            .input('branch', sql.NVarChar, senderBranch)
            .input('itemCode', sql.NVarChar, item.itemCode)
            .input('quantity', sql.Int, item.quantity)
            .query(`
              UPDATE Stocks
              SET transferred = transferred + @quantity,
                  sold = ISNULL(added, 0) - ISNULL(returned, 0) - (ISNULL(transferred, 0) + @quantity),
                  updatedAt = GETDATE()
              WHERE date = @date AND branch = @branch AND itemCode = @itemCode
            `);

          // Add to receiver (insert if not exists)
          await transaction.request()
            .input('date', sql.Date, date)
            .input('branch', sql.NVarChar, receiverBranch)
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
                INSERT (date, branch, itemCode, added, returned, transferred, sold)
                VALUES (source.date, source.branch, source.itemCode, source.quantity, 0, 0, source.quantity);
            `);
        }

      } else if (itemType === 'Grocery Item') {
        for (const item of items) {
          const senderBatches = item._senderStocks || [];
          let remainingToTransfer = parseFloat(item.quantity);

          for (const stock of senderBatches) {
            if (remainingToTransfer <= 0) break;

            const transferQty = Math.min(parseFloat(stock.remaining), remainingToTransfer);

            // Deduct from sender batch
            await transaction.request()
              .input('id', sql.NVarChar, stock.id)
              .input('qty', sql.Decimal(18, 3), transferQty)
              .query('UPDATE GroceryStocks SET remaining = remaining - @qty WHERE id = @id');

            // BUG-T03 FIX: use original batch addedDate (not transfer date) for receiver
            const receiverId = 'GROCERY_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const receiverBatchId = 'B' + Date.now() + Math.random().toString(36).substr(2, 9);

            await transaction.request()
              .input('id', sql.NVarChar, receiverId)
              .input('batchId', sql.NVarChar, receiverBatchId)
              .input('itemCode', sql.NVarChar, item.itemCode)
              .input('branch', sql.NVarChar, receiverBranch)
              .input('quantity', sql.Decimal(18, 3), transferQty)
              .input('remaining', sql.Decimal(18, 3), transferQty)
              .input('expiryDate', sql.Date, stock.expiryDate)
              .input('date', sql.Date, date)
              .input('addedDate', sql.Date, stock.addedDate || date) // BUG-T03 FIX: original addedDate
              .query(`
                INSERT INTO GroceryStocks (id, batchId, itemCode, branch, quantity, remaining, expiryDate, date, addedDate)
                VALUES (@id, @batchId, @itemCode, @branch, @quantity, @remaining, @expiryDate, @date, @addedDate)
              `);

            remainingToTransfer -= transferQty;
          }
        }
      }

      // Save transfer history (inside transaction)
      const transferId = 'TRANSFER_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

      // Remove _senderStocks cache before saving (internal use only)
      const cleanItems = items.map(({ _senderStocks, ...rest }) => rest);

      await transaction.request()
        .input('id', sql.NVarChar, transferId)
        .input('date', sql.Date, date)
        .input('senderBranch', sql.NVarChar, senderBranch)
        .input('receiverBranch', sql.NVarChar, receiverBranch)
        .input('itemType', sql.NVarChar, itemType)
        .input('items', sql.NVarChar, JSON.stringify(cleanItems))
        .input('processedBy', sql.NVarChar, processedBy || null)
        .query(`
          INSERT INTO TransferHistory (id, date, senderBranch, receiverBranch, itemType, items, processedBy)
          VALUES (@id, @date, @senderBranch, @receiverBranch, @itemType, @items, @processedBy)
        `);

      await transaction.commit();

    } catch (txError) {
      // BUG-T01 FIX: rollback ALL changes if anything fails
      await transaction.rollback();
      console.error('Transfer transaction failed, rolled back:', txError);
      return res.status(500).json({ success: false, message: 'Transfer failed and was fully rolled back. No stock was changed.' });
    }

    // ──────────────────────────────────────────────
    // Activity logging (outside transaction — non-critical, don't rollback for this)
    // ──────────────────────────────────────────────
    const activityTimestamp = new Date();
    const itemsMap = {};

    for (const item of items) {
      if (!itemsMap[item.itemCode]) {
        const itemResult = await pool.request()
          .input('code', sql.NVarChar, item.itemCode)
          .query('SELECT name FROM Items WHERE code = @code');
        if (itemResult.recordset.length > 0) {
          itemsMap[item.itemCode] = itemResult.recordset[0].name;
        }
      }
    }

    for (const item of items) {
      const itemName = itemsMap[item.itemCode] || item.itemCode;
      const quantity = item.quantity;

      // Sender: items sent out
      await createActivity(
        'transfer',
        `${quantity} ${itemName} transferred from ${senderBranch} to ${receiverBranch}`,
        senderBranch,
        activityTimestamp,
        { itemCode: item.itemCode, itemName, quantity, senderBranch, receiverBranch, itemType, date, direction: 'sent' },
        new Date(date)
      );

      // BUG-T07 FIX: "received from X at Y" (not "received from X to Y")
      await createActivity(
        'transfer',
        `${quantity} ${itemName} received from ${senderBranch} at ${receiverBranch}`,
        receiverBranch,
        activityTimestamp,
        { itemCode: item.itemCode, itemName, quantity, senderBranch, receiverBranch, itemType, date, direction: 'received' },
        new Date(date)
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
