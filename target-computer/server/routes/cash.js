const express = require('express');
const router = express.Router();
const cashController = require('../controllers/cashController');

router.get('/', cashController.getCashEntries);
router.post('/', cashController.createCashEntry);
router.get('/expected', cashController.calculateExpectedCash);

module.exports = router;

