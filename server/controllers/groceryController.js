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

    // Prevent entering a later date when previous Grocery Item date (with data) is not finished.
    const prevUnfinished = await pool.request()
      .input('date', sql.Date, stockDate)
      .input('branch', sql.NVarChar, branch)
      .query(`
        WITH prev AS (
          SELECT MAX(addedDate) AS prevDate
          FROM GroceryStocks
          WHERE branch = @branch
            AND addedDate IS NOT NULL
            AND addedDate < @date
        )
        SELECT p.prevDate
        FROM prev p
        WHERE p.prevDate IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM FinishedBatches fb
            WHERE fb.[date] = p.prevDate AND fb.branch = @branch AND fb.itemType = 'Grocery Item'
          );
      `);
    if (prevUnfinished.recordset?.[0]?.prevDate) {
      const d = new Date(prevUnfinished.recordset[0].prevDate).toISOString().split('T')[0];
      return res.status(400).json({
        success: false,
        message: `⚠️ Please finish the previous day first.\n\nBranch: ${branch}\nPending date: ${d}\n\nGo to Add Return Stock page and click Finish for ${d}. Then you can enter data for ${stockDate}.`
      });
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1b65bd69-1ca0-48a7-b561-8c48eafc8744',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'groceryController.js:54',message:'addGroceryStock - before insert',data:{itemCode,branch,quantity,expiryDate,date:stockDate,id,batchId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1b65bd69-1ca0-48a7-b561-8c48eafc8744',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'groceryController.js:67',message:'addGroceryStock - after insert',data:{itemCode,branch,quantity,date:stockDate,id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

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
    const { itemCode, itemName, branch, date, returnedQty, reason, recordedBy } = req.body;
    
    if (!itemCode || !branch || !date || !returnedQty) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }

    const pool = await getConnection();

    // Prevent entering a later date when previous Grocery Item date (with data) is not finished.
    const prevUnfinished = await pool.request()
      .input('date', sql.Date, date)
      .input('branch', sql.NVarChar, branch)
      .query(`
        WITH prev AS (
          SELECT MAX(addedDate) AS prevDate
          FROM GroceryStocks
          WHERE branch = @branch
            AND addedDate IS NOT NULL
            AND addedDate < @date
        )
        SELECT p.prevDate
        FROM prev p
        WHERE p.prevDate IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM FinishedBatches fb
            WHERE fb.[date] = p.prevDate AND fb.branch = @branch AND fb.itemType = 'Grocery Item'
          );
      `);
    if (prevUnfinished.recordset?.[0]?.prevDate) {
      const d = new Date(prevUnfinished.recordset[0].prevDate).toISOString().split('T')[0];
      return res.status(400).json({
        success: false,
        message: `⚠️ Please finish the previous day first.\n\nBranch: ${branch}\nPending date: ${d}\n\nGo to Add Return Stock page and click Finish for ${d}. Then you can enter data for ${date}.`
      });
    }

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

    // Auto-record remaining stock snapshot (after processing return)
    try {
      // Get recordedBy from request body, or try to extract from headers/auth
      let userRecordedBy = recordedBy;
      if (!userRecordedBy) {
        // Try to get from req.user if middleware sets it
        const user = req.user || {};
        userRecordedBy = user.id || user.username || null;
      }
      const notes = `Auto-recorded from return: ${returnedQty} ${reason || 'waste'}`;
      
      await recordRemainingSnapshot(pool, itemCode, branch, date, userRecordedBy, notes);
    } catch (snapshotError) {
      // Log error but don't fail the main operation
      console.error(`Error recording snapshot for ${itemCode}:`, snapshotError);
    }

    res.json({ success: true, message: 'Grocery return recorded successfully' });
  } catch (error) {
    console.error('Record grocery return error:', error);
    res.status(500).json({ success: false, message: 'Error recording grocery return' });
  }
};

const updateGroceryRemaining = async (req, res) => {
  try {
    const { branch, updates, date, recordedBy } = req.body; // updates: [{ itemCode, newRemaining }]
    
    if (!branch || !updates || !Array.isArray(updates)) {
      return res.status(400).json({ success: false, message: 'Invalid request data' });
    }

    const pool = await getConnection();
    const saleDate = date || new Date().toISOString().split('T')[0];

    // Prevent entering a later date when previous Grocery Item date (with data) is not finished.
    const prevUnfinished = await pool.request()
      .input('date', sql.Date, saleDate)
      .input('branch', sql.NVarChar, branch)
      .query(`
        WITH prev AS (
          SELECT MAX(addedDate) AS prevDate
          FROM GroceryStocks
          WHERE branch = @branch
            AND addedDate IS NOT NULL
            AND addedDate < @date
        )
        SELECT p.prevDate
        FROM prev p
        WHERE p.prevDate IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM FinishedBatches fb
            WHERE fb.[date] = p.prevDate AND fb.branch = @branch AND fb.itemType = 'Grocery Item'
          );
      `);
    if (prevUnfinished.recordset?.[0]?.prevDate) {
      const d = new Date(prevUnfinished.recordset[0].prevDate).toISOString().split('T')[0];
      return res.status(400).json({
        success: false,
        message: `⚠️ Please finish the previous day first.\n\nBranch: ${branch}\nPending date: ${d}\n\nGo to Add Return Stock page and click Finish for ${d}. Then you can enter data for ${saleDate}.`
      });
    }
    
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
          SELECT id, remaining, quantity, addedDate, date
          FROM GroceryStocks 
          WHERE itemCode = @itemCode AND branch = @branch
          ORDER BY expiryDate ASC, addedDate ASC
        `);

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1b65bd69-1ca0-48a7-b561-8c48eafc8744',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'groceryController.js:346',message:'updateGroceryRemaining - stocks before update',data:{itemCode:update.itemCode,branch,date,stocksCount:stocks.recordset.length,stocks:stocks.recordset.map(s=>({id:s.id,remaining:parseFloat((s.remaining ?? s.quantity) ?? 0),quantity:parseFloat(s.quantity ?? 0),addedDate:s.addedDate?.toISOString(),date:s.date?.toISOString()}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      // IMPORTANT: remaining can be 0; do not use `||` fallback (0 is falsy).
      const totalRemaining = stocks.recordset.reduce((sum, s) => sum + parseFloat((s.remaining ?? s.quantity) ?? 0), 0);
      const newRemaining = parseFloat(update.newRemaining);
      
      // Get the sale date
      const saleDate = date || new Date().toISOString().split('T')[0];
      
      // Get stock added on the current date (to calculate what was added today)
      const stockAddedToday = stocks.recordset
        .filter(s => {
          const addedDate = s.addedDate ? new Date(s.addedDate).toISOString().split('T')[0] : null;
          return addedDate === saleDate;
        })
        .reduce((sum, s) => sum + parseFloat(s.quantity || 0), 0);
      
      // Get previous remaining stock (from before today's additions)
      const previousRemaining = stocks.recordset
        .filter(s => {
          const addedDate = s.addedDate ? new Date(s.addedDate).toISOString().split('T')[0] : null;
          return addedDate !== saleDate;
        })
        // IMPORTANT: remaining can be 0; do not use `||` fallback (0 is falsy).
        .reduce((sum, s) => sum + parseFloat((s.remaining ?? s.quantity) ?? 0), 0);
      
      // Calculate sold quantity correctly:
      // soldQty = (previousRemaining + stockAddedToday) - newRemaining
      // This represents: (what was available at start of day + what was added today) - what remains = what was sold
      // Example: Day 1: previous=0, stockAddedToday=37, newRemaining=0 → sold = (0 + 37) - 0 = 37
      // Example: Day 2: previous=0, stockAddedToday=180, newRemaining=4 → sold = (0 + 180) - 4 = 176
      const totalAvailable = previousRemaining + stockAddedToday;
      const soldQty = Math.max(0, totalAvailable - newRemaining);

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1b65bd69-1ca0-48a7-b561-8c48eafc8744',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'groceryController.js:390',message:'updateGroceryRemaining - sold quantity calculation (fixed)',data:{itemCode:update.itemCode,branch,date:saleDate,totalRemaining,newRemaining,stockAddedToday,previousRemaining,totalAvailable,soldQty},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      // Check for existing GrocerySales records for this date/item/branch
      const existingSales = await pool.request()
        .input('itemCode', sql.NVarChar, update.itemCode)
        .input('branch', sql.NVarChar, branch)
        .input('date', sql.Date, saleDate)
        .query('SELECT soldQty, totalCash FROM GrocerySales WHERE itemCode = @itemCode AND branch = @branch AND date = @date');

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1b65bd69-1ca0-48a7-b561-8c48eafc8744',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'groceryController.js:365',message:'updateGroceryRemaining - existing sales check',data:{itemCode:update.itemCode,branch,date:saleDate,existingSalesCount:existingSales.recordset.length,existingSales:existingSales.recordset.map(s=>({soldQty:parseFloat(s.soldQty),totalCash:parseFloat(s.totalCash)}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

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
        // IMPORTANT: remaining can be 0; do not use `||` fallback (0 is falsy).
        const current = parseFloat((s.remaining ?? s.quantity) ?? 0);
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
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/1b65bd69-1ca0-48a7-b561-8c48eafc8744',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'groceryController.js:467',message:'updateGroceryRemaining - recording sale (MERGE)',data:{itemCode:update.itemCode,itemName:item.name,branch,date:saleDate,soldQty,totalCash,existingSalesCount:existingSales.recordset.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          // Use MERGE to update existing record or insert new one (prevents duplicates)
          await pool.request()
            .input('itemCode', sql.NVarChar, update.itemCode)
            .input('itemName', sql.NVarChar, item.name)
            .input('branch', sql.NVarChar, branch)
            .input('date', sql.Date, saleDate)
            .input('soldQty', sql.Decimal(18, 3), soldQty)
            .input('totalCash', sql.Decimal(18, 2), totalCash)
            .query(`
              MERGE GrocerySales AS target
              USING (SELECT @itemCode AS itemCode, @branch AS branch, @date AS date) AS source
              ON target.itemCode = source.itemCode 
                 AND target.branch = source.branch 
                 AND target.date = source.date
              WHEN MATCHED THEN
                UPDATE SET 
                  soldQty = @soldQty,
                  itemName = @itemName,
                  totalCash = @totalCash,
                  timestamp = GETDATE()
              WHEN NOT MATCHED THEN
                INSERT (itemCode, itemName, branch, date, soldQty, totalCash)
                VALUES (@itemCode, @itemName, @branch, @date, @soldQty, @totalCash);
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

      // Auto-record remaining stock snapshot (after updating batches)
      try {
        // Get recordedBy from request body, or try to extract from headers/auth
        let userRecordedBy = recordedBy;
        if (!userRecordedBy) {
          // Try to get from req.user if middleware sets it
          const user = req.user || {};
          userRecordedBy = user.id || user.username || null;
        }
        const recordDate = date || new Date().toISOString().split('T')[0];
        const notes = `Auto-recorded from remaining update`;
        
        await recordRemainingSnapshot(pool, update.itemCode, branch, recordDate, userRecordedBy, notes);
      } catch (snapshotError) {
        // Log error but don't fail the main operation
        console.error(`Error recording snapshot for ${update.itemCode}:`, snapshotError);
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

const getDailyRemaining = async (req, res) => {
  try {
    const { branch, date, dateFrom, dateTo, itemCode } = req.query;
    const pool = await getConnection();
    
    let query = `
      SELECT 
        dr.*,
        i.category,
        i.price,
        i.soldByWeight
      FROM GroceryDailyRemaining dr
      INNER JOIN Items i ON dr.itemCode = i.code
      WHERE 1=1
    `;
    const request = pool.request();
    
    if (branch) {
      query += ' AND dr.branch = @branch';
      request.input('branch', sql.NVarChar, branch);
    }
    if (date) {
      query += ' AND dr.date = @date';
      request.input('date', sql.Date, date);
    }
    if (dateFrom) {
      query += ' AND dr.date >= @dateFrom';
      request.input('dateFrom', sql.Date, dateFrom);
    }
    if (dateTo) {
      query += ' AND dr.date <= @dateTo';
      request.input('dateTo', sql.Date, dateTo);
    }
    if (itemCode) {
      query += ' AND dr.itemCode = @itemCode';
      request.input('itemCode', sql.NVarChar, itemCode);
    }
    
    query += ' ORDER BY dr.date DESC, dr.itemName ASC';
    const result = await request.query(query);
    
    res.json({ success: true, records: result.recordset });
  } catch (error) {
    console.error('Get daily remaining error:', error);
    res.status(500).json({ success: false, message: 'Error fetching daily remaining records' });
  }
};

const getDailyRemainingByItem = async (req, res) => {
  try {
    const { itemCode } = req.params;
    const { branch, dateFrom, dateTo } = req.query;
    
    if (!itemCode) {
      return res.status(400).json({ success: false, message: 'Item code is required' });
    }

    const pool = await getConnection();
    
    let query = `
      SELECT 
        dr.*,
        i.category,
        i.price,
        i.soldByWeight
      FROM GroceryDailyRemaining dr
      INNER JOIN Items i ON dr.itemCode = i.code
      WHERE dr.itemCode = @itemCode
    `;
    const request = pool.request();
    request.input('itemCode', sql.NVarChar, itemCode);
    
    if (branch) {
      query += ' AND dr.branch = @branch';
      request.input('branch', sql.NVarChar, branch);
    }
    if (dateFrom) {
      query += ' AND dr.date >= @dateFrom';
      request.input('dateFrom', sql.Date, dateFrom);
    }
    if (dateTo) {
      query += ' AND dr.date <= @dateTo';
      request.input('dateTo', sql.Date, dateTo);
    }
    
    query += ' ORDER BY dr.date ASC';
    const result = await request.query(query);
    
    res.json({ success: true, records: result.recordset });
  } catch (error) {
    console.error('Get daily remaining by item error:', error);
    res.status(500).json({ success: false, message: 'Error fetching daily remaining records for item' });
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

// Helper function to record remaining stock snapshot
const recordRemainingSnapshot = async (pool, itemCode, branch, date, recordedBy, notes) => {
  try {
    // Calculate total remaining from GroceryStocks
    const stocksResult = await pool.request()
      .input('itemCode', sql.NVarChar, itemCode)
      .input('branch', sql.NVarChar, branch)
      .query(`
        SELECT SUM(remaining) as totalRemaining
        FROM GroceryStocks
        WHERE itemCode = @itemCode AND branch = @branch
      `);

    const totalRemaining = parseFloat(stocksResult.recordset[0]?.totalRemaining || 0);

    // Get itemName from Items table
    const itemResult = await pool.request()
      .input('itemCode', sql.NVarChar, itemCode)
      .query('SELECT name FROM Items WHERE code = @itemCode');

    if (itemResult.recordset.length === 0) {
      console.error(`Item ${itemCode} not found for snapshot recording`);
      return false;
    }

    const itemName = itemResult.recordset[0].name;
    const recordDate = date || new Date().toISOString().split('T')[0];

    // MERGE into GroceryDailyRemaining
    await pool.request()
      .input('itemCode', sql.NVarChar, itemCode)
      .input('itemName', sql.NVarChar, itemName)
      .input('branch', sql.NVarChar, branch)
      .input('date', sql.Date, recordDate)
      .input('remainingQty', sql.Decimal(18, 3), totalRemaining)
      .input('recordedBy', sql.NVarChar, recordedBy)
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        MERGE GroceryDailyRemaining AS target
        USING (SELECT @itemCode AS itemCode, @branch AS branch, @date AS date) AS source
        ON target.itemCode = source.itemCode 
           AND target.branch = source.branch 
           AND target.date = source.date
        WHEN MATCHED THEN
          UPDATE SET 
            remainingQty = @remainingQty,
            itemName = @itemName,
            recordedBy = @recordedBy,
            notes = @notes,
            updatedAt = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (itemCode, itemName, branch, date, remainingQty, recordedBy, notes)
          VALUES (@itemCode, @itemName, @branch, @date, @remainingQty, @recordedBy, @notes);
      `);

    return true;
  } catch (error) {
    console.error(`Error recording remaining snapshot for ${itemCode}:`, error);
    return false;
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
  finishGroceryBatch,
  getDailyRemaining,
  getDailyRemainingByItem
};

