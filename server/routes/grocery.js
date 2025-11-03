const express = require('express');
const router = express.Router();
const groceryController = require('../controllers/groceryController');

router.get('/stocks', groceryController.getGroceryStocks);
router.post('/stocks', groceryController.addGroceryStock);
router.get('/sales', groceryController.getGrocerySales);
router.post('/sales', groceryController.recordGrocerySale);
router.get('/returns', groceryController.getGroceryReturns);
router.post('/returns', groceryController.recordGroceryReturn);
router.put('/stocks/remaining', groceryController.updateGroceryRemaining);

module.exports = router;

