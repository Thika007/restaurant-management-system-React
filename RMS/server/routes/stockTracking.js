const express = require('express');
const router = express.Router();
const stockTrackingController = require('../controllers/stockTrackingController');

router.get('/', stockTrackingController.getStockTracking);

module.exports = router;

