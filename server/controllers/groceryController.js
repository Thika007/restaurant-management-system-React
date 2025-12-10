const { getConnection, sql } = require('../config/db');
const { checkExpiringItems } = require('./notificationsController');
const { createActivity } = require('./activitiesController');

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

    // Get item name for activity logging
    let itemName = itemCode;
    try {
      const itemResult = await pool.request()
        .input('itemCode', sql.NVarChar, itemCode)
        .query('SELECT name FROM Items WHERE code = @itemCode');
      
      if (itemResult.recordset.length > 0) {
        itemName = itemResult.recordset[0].name;
      }
    } catch (error) {
      console.error('Error fetching item name for activity:', error);
    }

    // Log activity for grocery stock addition
    const activityTimestamp = new Date();
    await createActivity(
      'grocery_stock_added',
      `${quantity} ${itemName} added to ${branch}`,
      branch,
      activityTimestamp,
      { itemCode, quantity, expiryDate, date: stockDate },
      new Date(stockDate) // realDate: the actual stock date
    );

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

    // Log activity for grocery sale
    const activityTimestamp = new Date();
    await createActivity(
      'grocery_sale',
      `${soldQty} ${itemName} sold at ${branch}`,
      branch,
      activityTimestamp,
      { itemCode, itemName, soldQty, totalCash, date },
      new Date(date) // realDate: the actual sale date
    );

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
    // Get all stocks including those with remaining = 0 (to handle edge cases)
    const stocks = await pool.request()
      .input('itemCode', sql.NVarChar, itemCode)
      .input('branch', sql.NVarChar, branch)
      .query(`
        SELECT id, remaining 
        FROM GroceryStocks 
        WHERE itemCode = @itemCode AND branch = @branch
        ORDER BY expiryDate ASC, addedDate ASC
      `);

    let remainingToReturn = parseFloat(returnedQty);
    
    // Only process stocks with remaining > 0
    const stocksWithRemaining = stocks.recordset.filter(s => parseFloat(s.remaining || 0) > 0);
    
    for (const stock of stocksWithRemaining) {
      if (remainingToReturn <= 0) break;
      const currentRemaining = parseFloat(stock.remaining || 0);
      const deduct = Math.min(currentRemaining, remainingToReturn);
      
      // Update remaining (can become 0)
      const newRemaining = Math.max(0, currentRemaining - deduct);
      
      await pool.request()
        .input('id', sql.NVarChar, stock.id)
        .input('remaining', sql.Decimal(18, 3), newRemaining)
        .query('UPDATE GroceryStocks SET remaining = @remaining WHERE id = @id');
      
      remainingToReturn -= deduct;
    }
    
    // Validate that we had enough stock to return
    if (remainingToReturn > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot return ${returnedQty}. Only ${parseFloat(returnedQty) - remainingToReturn} available stock.` 
      });
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

    // Log activity for grocery return
    const activityTimestamp = new Date();
    const reasonText = reason && reason !== 'waste' ? ` (${reason})` : ' (waste)';
    await createActivity(
      'grocery_return',
      `${returnedQty} ${itemName} returned${reasonText} at ${branch}`,
      branch,
      activityTimestamp,
      { itemCode, itemName, returnedQty, reason: reason || 'waste', date },
      new Date(date) // realDate: the actual return date
    );

    res.json({ success: true, message: 'Grocery return recorded successfully' });
  } catch (error) {
    console.error('Record grocery return error:', error);
    res.status(500).json({ success: false, message: 'Error recording grocery return' });
  }
};

const updateGroceryRemaining = async (req, res) => {
  try {
    const { branch, updates, date } = req.body; // updates: [{ itemCode, newRemaining }]
    
    if (!branch || !updates || !Array.isArray(updates)) {
      return res.status(400).json({ success: false, message: 'Invalid request data' });
    }

    const pool = await getConnection();
    
    // Check if grocery batch is finished for this date and branch
    if (date) {
      const finishedCheck = await pool.request()
        .input('date', sql.Date, date)
        .input('branch', sql.NVarChar, branch)
        .input('itemType', sql.NVarChar, 'Grocery Item')
        .query('SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch AND itemType = @itemType');
      
      if (finishedCheck.recordset.length > 0) {
        return res.status(400).json({ success: false, message: 'Grocery batch is already finished. Cannot update remaining quantities.' });
      }
    }

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

      // Determine if item is sold by weight to choose rounding strategy
      const itemInfo = await pool.request()
        .input('itemCode', sql.NVarChar, update.itemCode)
        .query('SELECT soldByWeight FROM Items WHERE code = @itemCode');
      const soldByWeight = itemInfo.recordset[0]?.soldByWeight === true || itemInfo.recordset[0]?.soldByWeight === 1;

      // Proportional allocation across batches
      const allocations = stocks.recordset.map(s => {
        const current = parseFloat(s.remaining || s.quantity || 0);
        const proportion = totalRemaining > 0 ? (current / totalRemaining) : 0;
        const alloc = Math.max(0, Math.min(current, newRemaining * proportion));
        return { id: s.id, current, alloc };
      });

      if (soldByWeight) {
        // Round to 3 decimals to avoid 3.999 -> 3 truncation on UI
        let sum = 0;
        for (const a of allocations) {
          a.alloc = Math.min(a.current, Math.max(0, Math.round(a.alloc * 1000) / 1000));
          sum += a.alloc;
        }
        // Adjust small floating diff to exactly match newRemaining within 0.001
        const diff = Math.round((newRemaining - sum) * 1000) / 1000;
        if (Math.abs(diff) >= 0.001) {
          // Distribute difference to batches with available headroom
          for (const a of allocations) {
            if (diff > 0 && a.alloc + 0.001 <= a.current) { a.alloc = Math.round((a.alloc + 0.001) * 1000) / 1000; break; }
            if (diff < 0 && a.alloc - 0.001 >= 0) { a.alloc = Math.round((a.alloc - 0.001) * 1000) / 1000; break; }
          }
        }
      } else {
        // Integer-safe allocation for non-weight items
        const prelim = allocations.map(a => ({
          id: a.id,
          current: a.current,
          base: Math.min(a.current, Math.max(0, Math.floor(a.alloc)))
        }));
        let sumInt = prelim.reduce((s, a) => s + a.base, 0);
        let target = Math.round(newRemaining);
        let remainingUnits = Math.max(0, target - sumInt);

        // Sort by largest fractional part to add leftover units
        const withFrac = allocations.map(a => ({
          id: a.id,
          current: a.current,
          frac: a.alloc - Math.floor(a.alloc)
        })).sort((x, y) => y.frac - x.frac);

        const intMap = new Map(prelim.map(a => [a.id, a.base]));
        for (const a of withFrac) {
          if (remainingUnits <= 0) break;
          const curVal = intMap.get(a.id) || 0;
          if (curVal < a.current) { // don't exceed available in that batch
            intMap.set(a.id, curVal + 1);
            remainingUnits -= 1;
          }
        }

        // Apply back to allocations as integers
        allocations.forEach(a => {
          a.alloc = Math.min(a.current, intMap.get(a.id) || 0);
        });
      }

      // Persist updated remaining values
      for (const a of allocations) {
        await pool.request()
          .input('id', sql.NVarChar, a.id)
          .input('remaining', sql.Decimal(18, 3), a.alloc)
          .query('UPDATE GroceryStocks SET remaining = @remaining WHERE id = @id');
      }

      // Record sale if soldQty > 0
      if (soldQty > 0) {
        const itemResult = await pool.request()
          .input('itemCode', sql.NVarChar, update.itemCode)
          .query('SELECT name, price FROM Items WHERE code = @itemCode');
        
        if (itemResult.recordset.length > 0) {
          const item = itemResult.recordset[0];
          const saleDate = date || new Date().toISOString().split('T')[0];
          const totalCash = soldQty * parseFloat(item.price);
          
          await pool.request()
            .input('itemCode', sql.NVarChar, update.itemCode)
            .input('itemName', sql.NVarChar, item.name)
            .input('branch', sql.NVarChar, branch)
            .input('date', sql.Date, saleDate)
            .input('soldQty', sql.Decimal(18, 3), soldQty)
            .input('totalCash', sql.Decimal(18, 2), totalCash)
            .query(`
              INSERT INTO GrocerySales (itemCode, itemName, branch, date, soldQty, totalCash)
              VALUES (@itemCode, @itemName, @branch, @date, @soldQty, @totalCash)
            `);

          // Log activity for grocery sale (when remaining is updated)
          const activityTimestamp = new Date();
          await createActivity(
            'grocery_sale',
            `${soldQty} ${item.name} sold at ${branch}`,
            branch,
            activityTimestamp,
            { itemCode: update.itemCode, itemName: item.name, soldQty, totalCash, date: saleDate },
            new Date(saleDate)
          );
        }
      }
    }

    res.json({ success: true, message: 'Grocery remaining updated successfully' });
  } catch (error) {
    console.error('Update grocery remaining error:', error);
    res.status(500).json({ success: false, message: 'Error updating grocery remaining' });
  }
};

const getGroceryStocksByDate = async (req, res) => {
  try {
    const { branch, itemCode, date } = req.query;
    
    if (!branch || !date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Branch and date are required' 
      });
    }

    const pool = await getConnection();

    // 1. Get all stocks added on or before the target date
    let stocksQuery = `
      SELECT itemCode, SUM(quantity) as totalAdded
      FROM GroceryStocks
      WHERE branch = @branch AND addedDate <= @date
    `;
    const stocksRequest = pool.request()
      .input('branch', sql.NVarChar, branch)
      .input('date', sql.Date, date);
    
    if (itemCode) {
      stocksQuery += ' AND itemCode = @itemCode';
      stocksRequest.input('itemCode', sql.NVarChar, itemCode);
    }
    
    stocksQuery += ' GROUP BY itemCode';
    const stocksResult = await stocksRequest.query(stocksQuery);

    // 2. Get total sales on or before the target date
    let salesQuery = `
      SELECT itemCode, SUM(soldQty) as totalSold
      FROM GrocerySales
      WHERE branch = @branch AND date <= @date
    `;
    const salesRequest = pool.request()
      .input('branch', sql.NVarChar, branch)
      .input('date', sql.Date, date);
    
    if (itemCode) {
      salesQuery += ' AND itemCode = @itemCode';
      salesRequest.input('itemCode', sql.NVarChar, itemCode);
    }
    
    salesQuery += ' GROUP BY itemCode';
    const salesResult = await salesRequest.query(salesQuery);

    // 3. Get total returns on or before the target date
    let returnsQuery = `
      SELECT itemCode, SUM(returnedQty) as totalReturned
      FROM GroceryReturns
      WHERE branch = @branch AND date <= @date
    `;
    const returnsRequest = pool.request()
      .input('branch', sql.NVarChar, branch)
      .input('date', sql.Date, date);
    
    if (itemCode) {
      returnsQuery += ' AND itemCode = @itemCode';
      returnsRequest.input('itemCode', sql.NVarChar, itemCode);
    }
    
    returnsQuery += ' GROUP BY itemCode';
    const returnsResult = await returnsRequest.query(returnsQuery);

    // 4. Get transfers OUT (sender) on or before the target date
    const transfersOutQuery = `
      SELECT items
      FROM TransferHistory
      WHERE senderBranch = @branch AND date <= @date AND itemType = 'Grocery Item'
    `;
    const transfersOutResult = await pool.request()
      .input('branch', sql.NVarChar, branch)
      .input('date', sql.Date, date)
      .query(transfersOutQuery);

    // 5. Get transfers IN (receiver) on or before the target date
    const transfersInQuery = `
      SELECT items
      FROM TransferHistory
      WHERE receiverBranch = @branch AND date <= @date AND itemType = 'Grocery Item'
    `;
    const transfersInResult = await pool.request()
      .input('branch', sql.NVarChar, branch)
      .input('date', sql.Date, date)
      .query(transfersInQuery);

    // 6. Combine all data and calculate available stock
    const stockMap = {};
    
    // Initialize with stocks added
    stocksResult.recordset.forEach(row => {
      stockMap[row.itemCode] = {
        itemCode: row.itemCode,
        added: parseFloat(row.totalAdded || 0),
        sold: 0,
        returned: 0,
        transferredOut: 0,
        transferredIn: 0,
        available: 0
      };
    });

    // Add sales
    salesResult.recordset.forEach(row => {
      if (!stockMap[row.itemCode]) {
        stockMap[row.itemCode] = {
          itemCode: row.itemCode,
          added: 0,
          sold: 0,
          returned: 0,
          transferredOut: 0,
          transferredIn: 0,
          available: 0
        };
      }
      stockMap[row.itemCode].sold = parseFloat(row.totalSold || 0);
    });

    // Add returns
    returnsResult.recordset.forEach(row => {
      if (!stockMap[row.itemCode]) {
        stockMap[row.itemCode] = {
          itemCode: row.itemCode,
          added: 0,
          sold: 0,
          returned: 0,
          transferredOut: 0,
          transferredIn: 0,
          available: 0
        };
      }
      stockMap[row.itemCode].returned = parseFloat(row.totalReturned || 0);
    });

    // Process transfers out - parse JSON array
    transfersOutResult.recordset.forEach(row => {
      try {
        const items = JSON.parse(row.items);
        if (Array.isArray(items)) {
          items.forEach(item => {
            if (item.itemCode) {
              if (!stockMap[item.itemCode]) {
                stockMap[item.itemCode] = {
                  itemCode: item.itemCode,
                  added: 0,
                  sold: 0,
                  returned: 0,
                  transferredOut: 0,
                  transferredIn: 0,
                  available: 0
                };
              }
              stockMap[item.itemCode].transferredOut += parseFloat(item.quantity || 0);
            }
          });
        }
      } catch (e) {
        console.error('Error parsing transfer items JSON:', e);
      }
    });

    // Process transfers in - parse JSON array
    transfersInResult.recordset.forEach(row => {
      try {
        const items = JSON.parse(row.items);
        if (Array.isArray(items)) {
          items.forEach(item => {
            if (item.itemCode) {
              if (!stockMap[item.itemCode]) {
                stockMap[item.itemCode] = {
                  itemCode: item.itemCode,
                  added: 0,
                  sold: 0,
                  returned: 0,
                  transferredOut: 0,
                  transferredIn: 0,
                  available: 0
                };
              }
              stockMap[item.itemCode].transferredIn += parseFloat(item.quantity || 0);
            }
          });
        }
      } catch (e) {
        console.error('Error parsing transfer items JSON:', e);
      }
    });

    // Calculate available stock for each item
    const stocks = Object.values(stockMap).map(item => {
      const available = Math.max(0, 
        (item.added + item.transferredIn) - 
        (item.sold + item.returned + item.transferredOut)
      );
      return {
        ...item,
        available: available
      };
    }).filter(item => item.available > 0 || item.added > 0); // Show items with stock or history

    res.json({ success: true, stocks, date });
  } catch (error) {
    console.error('Get grocery stocks by date error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error calculating historical grocery stocks' 
    });
  }
};

const checkGroceryFinished = async (req, res) => {
  try {
    const { date, branch } = req.query;
    
    if (!date || !branch) {
      return res.status(400).json({ success: false, message: 'Date and branch are required' });
    }

    const pool = await getConnection();
    
    // Check if grocery batch is finished (always filter by itemType)
    const result = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .input('itemType', sql.NVarChar, 'Grocery Item')
      .query(`
        SELECT finishedAt 
        FROM FinishedBatches 
        WHERE date = @date AND branch = @branch AND itemType = @itemType
      `);

    res.json({ 
      success: true, 
      isFinished: result.recordset.length > 0,
      finishedAt: result.recordset.length > 0 && result.recordset[0].finishedAt
        ? (result.recordset[0].finishedAt instanceof Date 
            ? result.recordset[0].finishedAt.toISOString() 
            : new Date(result.recordset[0].finishedAt).toISOString())
        : null
    });
  } catch (error) {
    console.error('Check grocery finished error:', error);
    res.status(500).json({ success: false, message: 'Error checking grocery finish status' });
  }
};

const finishGroceryBatch = async (req, res) => {
  try {
    const { date, branch } = req.body;

    if (!date || !branch) {
      return res.status(400).json({ success: false, message: 'Date and branch are required' });
    }

    const pool = await getConnection();
    
    // Check if already finished for Grocery Items
    const checkResult = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .input('itemType', sql.NVarChar, 'Grocery Item')
      .query('SELECT * FROM FinishedBatches WHERE date = @date AND branch = @branch AND itemType = @itemType');

    if (checkResult.recordset.length > 0) {
      return res.status(400).json({ success: false, message: 'Grocery batch is already finished' });
    }

    // Mark batch as finished for Grocery Items
    await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .input('itemType', sql.NVarChar, 'Grocery Item')
      .query('INSERT INTO FinishedBatches (date, branch, itemType, finishedAt) VALUES (@date, @branch, @itemType, GETDATE())');

    // Log activity for grocery batch finish
    const activityTimestamp = new Date();
    await createActivity(
      'grocery_batch_finished',
      `Grocery batch finished at ${branch}`,
      branch,
      activityTimestamp,
      { date, branch },
      new Date(date) // realDate: the actual batch date
    );

    res.json({ success: true, message: 'Grocery batch finished successfully' });
  } catch (error) {
    console.error('Finish grocery batch error:', error);
    res.status(500).json({ success: false, message: 'Error finishing grocery batch' });
  }
};

module.exports = {
  getGroceryStocks,
  getGroceryStocksByDate,
  addGroceryStock,
  getGrocerySales,
  recordGrocerySale,
  getGroceryReturns,
  recordGroceryReturn,
  updateGroceryRemaining,
  checkGroceryFinished,
  finishGroceryBatch
};

