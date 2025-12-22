const express = require('express');
const router = express.Router();
const transfersController = require('../controllers/transfersController');

router.get('/', transfersController.getTransfers);
router.post('/', transfersController.createTransfer);

module.exports = router;

