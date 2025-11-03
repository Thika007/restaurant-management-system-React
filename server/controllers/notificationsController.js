const { getConnection, sql } = require('../config/db');

const generateId = () => 'NOTIF_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

const getNotifications = async (req, res) => {
  try {
    const { branch, userId, userRole, assignedBranches } = req.query;
    const pool = await getConnection();
    
    let query = 'SELECT * FROM Notifications WHERE 1=1';
    const request = pool.request();
    
    // Filter by branch if provided
    if (branch) {
      query += ' AND branch = @branch';
      request.input('branch', sql.NVarChar, branch);
    }
    
    // Filter by user's branch access (admin sees all, others see only assigned branches)
    if (userRole !== 'admin' && assignedBranches) {
      try {
        const branches = JSON.parse(assignedBranches);
        if (branches && branches.length > 0) {
          // Create a parameterized query for branch filtering
          const branchParams = branches.map((b, i) => {
            const paramName = `branch${i}`;
            request.input(paramName, sql.NVarChar, b);
            return `@${paramName}`;
          }).join(', ');
          query += ` AND (branch IS NULL OR branch IN (${branchParams}))`;
        } else {
          // No assigned branches - show only notifications without branch
          query += ' AND branch IS NULL';
        }
      } catch (e) {
        console.error('Error parsing assignedBranches:', e);
      }
    }
    
    query += ' ORDER BY createdAt DESC';
    const result = await request.query(query);
    
    const notifications = result.recordset.map(n => {
      // Remove batch ID from message if it exists (for existing notifications)
      let cleanedMessage = n.message || '';
      // Pattern: "(Batch: B...) " or " (Batch: B...)" anywhere in the message
      cleanedMessage = cleanedMessage.replace(/\s*\(Batch:\s*[^)]+\)\s*/gi, ' ').trim();
      cleanedMessage = cleanedMessage.replace(/\s+/g, ' '); // Clean up extra spaces
      
      return {
        ...n,
        message: cleanedMessage,
        readBy: n.readBy ? JSON.parse(n.readBy) : []
      };
    });
    
    res.json({ success: true, notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Error fetching notifications' });
  }
};

const createNotification = async (req, res) => {
  try {
    const { type, message, branch, itemCode, itemName, batchId, quantity, expiryDate, dateAdded } = req.body;
    
    if (!type || !message) {
      return res.status(400).json({ success: false, message: 'Type and message are required' });
    }

    const pool = await getConnection();
    const id = generateId();

    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('type', sql.NVarChar, type)
      .input('message', sql.NVarChar, message)
      .input('branch', sql.NVarChar, branch || null)
      .input('itemCode', sql.NVarChar, itemCode || null)
      .input('itemName', sql.NVarChar, itemName || null)
      .input('batchId', sql.NVarChar, batchId || null)
      .input('quantity', sql.Decimal(18, 3), quantity || null)
      .input('expiryDate', sql.Date, expiryDate || null)
      .input('dateAdded', sql.Date, dateAdded || null)
      .input('readBy', sql.NVarChar, JSON.stringify([]))
      .query(`
        INSERT INTO Notifications (id, type, message, branch, itemCode, itemName, batchId, quantity, expiryDate, dateAdded, readBy)
        VALUES (@id, @type, @message, @branch, @itemCode, @itemName, @batchId, @quantity, @expiryDate, @dateAdded, @readBy)
      `);

    res.json({ success: true, message: 'Notification created successfully' });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ success: false, message: 'Error creating notification' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const pool = await getConnection();

    // Get current notification
    const notifResult = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT readBy FROM Notifications WHERE id = @id');

    if (notifResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    const readBy = notifResult.recordset[0].readBy ? JSON.parse(notifResult.recordset[0].readBy) : [];
    if (!readBy.includes(userId)) {
      readBy.push(userId);
    }

    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('readBy', sql.NVarChar, JSON.stringify(readBy))
      .query('UPDATE Notifications SET readBy = @readBy WHERE id = @id');

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ success: false, message: 'Error marking notification as read' });
  }
};

/**
 * Check for expiring items and create notifications
 * This function checks grocery stocks for items expiring within 3 days
 * Creates notifications for items (prefers notifyExpiry enabled items, but includes all if none found)
 */
const checkExpiringItems = async () => {
  try {
    const pool = await getConnection();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Calculate date 3 days from now (more lenient)
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    
    console.log(`[Expiry Check] Starting check - Today: ${today.toISOString().split('T')[0]}, 3 days later: ${threeDaysLater.toISOString().split('T')[0]}`);
    
    // Get all grocery items expiring within 3 days with notifyExpiry enabled
    // Also include items where notifyExpiry is NULL (default to enabled)
    const stocksResult = await pool.request()
      .input('today', sql.Date, today)
      .input('threeDaysLater', sql.Date, threeDaysLater)
      .query(`
        SELECT gs.id, gs.batchId, gs.itemCode, gs.branch, gs.quantity, gs.remaining, 
               gs.expiryDate, gs.addedDate, i.name as itemName, i.notifyExpiry, i.itemType
        FROM GroceryStocks gs
        INNER JOIN Items i ON gs.itemCode = i.code
        WHERE gs.expiryDate >= @today 
          AND gs.expiryDate <= @threeDaysLater
          AND gs.remaining > 0
          AND i.itemType = 'Grocery Item'
          AND (i.notifyExpiry = 1 OR i.notifyExpiry IS NULL)
        ORDER BY gs.expiryDate ASC
      `);

    console.log(`[Expiry Check] Found ${stocksResult.recordset.length} stocks expiring within 3 days`);
    
    // Log details for debugging
    if (stocksResult.recordset.length > 0) {
      stocksResult.recordset.forEach(stock => {
        const daysUntilExpiry = Math.ceil((new Date(stock.expiryDate) - today) / (1000 * 60 * 60 * 24));
        console.log(`[Expiry Check] Item: ${stock.itemName}, Expiry: ${stock.expiryDate.toISOString().split('T')[0]}, Days left: ${daysUntilExpiry}, NotifyExpiry: ${stock.notifyExpiry}`);
      });
    }

    if (stocksResult.recordset.length === 0) {
      return { checked: 0, created: 0, message: 'No items expiring within 3 days found' };
    }

    let notificationsCreated = 0;
    
    for (const stock of stocksResult.recordset) {
      // Check if notification already exists for this batch
      const existingNotif = await pool.request()
        .input('type', sql.NVarChar, 'expiry')
        .input('itemCode', sql.NVarChar, stock.itemCode)
        .input('branch', sql.NVarChar, stock.branch)
        .input('batchId', sql.NVarChar, stock.batchId)
        .input('expiryDate', sql.Date, stock.expiryDate)
        .query(`
          SELECT id FROM Notifications 
          WHERE type = @type 
            AND itemCode = @itemCode 
            AND branch = @branch 
            AND batchId = @batchId 
            AND expiryDate = @expiryDate
        `);

      // Only create notification if it doesn't exist
      if (existingNotif.recordset.length === 0) {
        const expiryDateObj = new Date(stock.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDateObj - today) / (1000 * 60 * 60 * 24));
        const expiryDateStr = expiryDateObj.toISOString().split('T')[0];
        const message = `${stock.quantity} ${stock.itemName} will expire in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''} at ${stock.branch}. Expiry date: ${expiryDateStr}`;
        
        const notificationId = generateId();
        
        console.log(`[Expiry Check] Creating notification for ${stock.itemName} expiring in ${daysUntilExpiry} days (${expiryDateStr})`);
        
        await pool.request()
          .input('id', sql.NVarChar, notificationId)
          .input('type', sql.NVarChar, 'expiry')
          .input('message', sql.NVarChar, message)
          .input('branch', sql.NVarChar, stock.branch)
          .input('itemCode', sql.NVarChar, stock.itemCode)
          .input('itemName', sql.NVarChar, stock.itemName)
          .input('batchId', sql.NVarChar, stock.batchId)
          .input('quantity', sql.Decimal(18, 3), stock.quantity)
          .input('expiryDate', sql.Date, stock.expiryDate)
          .input('dateAdded', sql.Date, stock.addedDate)
          .input('readBy', sql.NVarChar, JSON.stringify([]))
          .query(`
            INSERT INTO Notifications (id, type, message, branch, itemCode, itemName, batchId, quantity, expiryDate, dateAdded, readBy)
            VALUES (@id, @type, @message, @branch, @itemCode, @itemName, @batchId, @quantity, @expiryDate, @dateAdded, @readBy)
          `);
        
        notificationsCreated++;
        console.log(`[Expiry Check] Notification created successfully: ${notificationId}`);
      } else {
        console.log(`[Expiry Check] Notification already exists for ${stock.itemName} (Expiry: ${new Date(stock.expiryDate).toISOString().split('T')[0]})`);
      }
    }

    console.log(`[Expiry Check] Created ${notificationsCreated} new notifications`);
    return { 
      checked: stocksResult.recordset.length, 
      created: notificationsCreated,
      message: `Checked ${stocksResult.recordset.length} items, created ${notificationsCreated} notifications`
    };
  } catch (error) {
    console.error('[Expiry Check] Error:', error);
    return { checked: 0, created: 0, error: error.message };
  }
};

module.exports = {
  getNotifications,
  createNotification,
  markAsRead,
  checkExpiringItems
};

