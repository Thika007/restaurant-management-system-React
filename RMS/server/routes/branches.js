const express = require('express');
const router = express.Router();
const branchesController = require('../controllers/branchesController');

router.get('/', branchesController.getAllBranches);
router.get('/:name', branchesController.getBranchByName);
router.post('/', branchesController.createBranch);
router.put('/:originalName', branchesController.updateBranch);
router.delete('/:name', branchesController.deleteBranch);

module.exports = router;

