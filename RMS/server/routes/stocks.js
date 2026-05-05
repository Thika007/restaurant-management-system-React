const express = require('express');
const router = express.Router();
const stocksController = require('../controllers/stocksController');

router.get('/', stocksController.getStocks);
router.get('/range', stocksController.getStocksRange);  // Batch: fetch all stocks for date range
router.get('/batch-status', stocksController.getBatchStatus);
router.post('/update', stocksController.updateStocks);
router.post('/finish-batch', stocksController.finishBatch);
router.post('/update-returns', stocksController.updateReturns);

module.exports = router;
