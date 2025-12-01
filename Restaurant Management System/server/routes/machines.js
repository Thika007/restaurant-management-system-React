const express = require('express');
const router = express.Router();
const machinesController = require('../controllers/machinesController');

router.get('/batches', machinesController.getBatches);
router.post('/batches', machinesController.startBatch);
router.put('/batches/:id', machinesController.updateBatch);
router.post('/batches/:id/finish', machinesController.finishBatch);
router.get('/sales', machinesController.getSales);

module.exports = router;

