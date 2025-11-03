const express = require('express');
const router = express.Router();
const itemsController = require('../controllers/itemsController');

router.get('/', itemsController.getAllItems);
router.get('/:code', itemsController.getItemByCode);
router.post('/', itemsController.createItem);
router.put('/:code', itemsController.updateItem);
router.delete('/:code', itemsController.deleteItem);

module.exports = router;

