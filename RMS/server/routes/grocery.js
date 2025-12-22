const express = require('express');
const router = express.Router();
const groceryController = require('../controllers/groceryController');

router.get('/stocks', groceryController.getGroceryStocks);
router.get('/stocks-by-date', groceryController.getGroceryStocksByDate);
router.post('/stocks', groceryController.addGroceryStock);
router.get('/sales', groceryController.getGrocerySales);
router.post('/sales', groceryController.recordGrocerySale);
router.get('/returns', groceryController.getGroceryReturns);
router.post('/returns', groceryController.recordGroceryReturn);
router.put('/stocks/remaining', groceryController.updateGroceryRemaining);
router.get('/check-finished', groceryController.checkGroceryFinished);
router.post('/finish-batch', groceryController.finishGroceryBatch);

module.exports = router;

