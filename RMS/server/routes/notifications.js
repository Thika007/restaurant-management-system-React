const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notificationsController');

router.get('/', notificationsController.getNotifications);
router.post('/', notificationsController.createNotification);
router.put('/:id/read', notificationsController.markAsRead);
router.post('/check-expiring', async (req, res) => {
  try {
    console.log('[API] Checking for expiring items...');
    const result = await notificationsController.checkExpiringItems();
    console.log('[API] Expiry check result:', result);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[API] Error checking expiring items:', error);
    res.status(500).json({ success: false, message: 'Error checking expiring items', error: error.message });
  }
});

// Clean up existing notifications to remove batch IDs from messages
const cleanupNotificationMessages = async () => {
  try {
    const { getConnection, sql } = require('../config/db');
    const pool = await getConnection();
    
    // Get all notifications with batch IDs in messages
    const result = await pool.request().query(`SELECT id, message FROM Notifications WHERE message LIKE '%Batch:%' OR message LIKE '%(Batch:%'`);
    
    let updated = 0;
    for (const notif of result.recordset) {
      // Remove batch ID from message - matches "(Batch: ...)" pattern
      let cleanedMessage = notif.message || '';
      cleanedMessage = cleanedMessage.replace(/\s*\(Batch:\s*[^)]+\)\s*/gi, ' ').trim();
      cleanedMessage = cleanedMessage.replace(/\s+/g, ' '); // Clean up extra spaces
      
      if (cleanedMessage !== notif.message) {
        await pool.request()
          .input('id', sql.NVarChar, notif.id)
          .input('message', sql.NVarChar, cleanedMessage)
          .query('UPDATE Notifications SET message = @message WHERE id = @id');
        updated++;
      }
    }
    
    if (updated > 0) {
      console.log(`[Notifications] Cleaned up ${updated} notification messages (removed batch IDs)`);
    }
    return { updated };
  } catch (error) {
    console.error('[Notifications] Error cleaning up notification messages:', error);
    return { updated: 0, error: error.message };
  }
};

router.post('/cleanup-messages', async (req, res) => {
  try {
    const result = await cleanupNotificationMessages();
    res.json({ success: true, message: `Cleaned up ${result.updated} notification messages`, updated: result.updated });
  } catch (error) {
    console.error('[API] Error cleaning up notification messages:', error);
    res.status(500).json({ success: false, message: 'Error cleaning up messages', error: error.message });
  }
});

// Test endpoint to create a sample notification
router.post('/test', async (req, res) => {
  try {
    const { getConnection, sql } = require('../config/db');
    const pool = await getConnection();
    const generateId = () => 'NOTIF_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const testNotificationId = generateId();
    const testMessage = 'Test notification - System is working!';
    
    await pool.request()
      .input('id', sql.NVarChar, testNotificationId)
      .input('type', sql.NVarChar, 'test')
      .input('message', sql.NVarChar, testMessage)
      .input('branch', sql.NVarChar, null)
      .input('readBy', sql.NVarChar, JSON.stringify([]))
      .query(`
        INSERT INTO Notifications (id, type, message, branch, readBy)
        VALUES (@id, @type, @message, @branch, @readBy)
      `);
    
    res.json({ success: true, message: 'Test notification created', id: testNotificationId });
  } catch (error) {
    console.error('[API] Error creating test notification:', error);
    res.status(500).json({ success: false, message: 'Error creating test notification', error: error.message });
  }
});

module.exports = router;
module.exports.cleanupNotificationMessages = cleanupNotificationMessages;

