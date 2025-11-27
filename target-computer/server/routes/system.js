const express = require('express');
const router = express.Router();
const systemController = require('../controllers/systemController');

// Test route to verify system routes are working
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'System routes are working!' });
});

// Clear all transaction data (admin only operation)
router.delete('/clear-data', systemController.clearTransactionData);

module.exports = router;

