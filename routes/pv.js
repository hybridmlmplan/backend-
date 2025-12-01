const express = require('express');
const router = express.Router();
const pvController = require('../controllers/pvController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/user/:userId', authMiddleware.protect, pvController.getUserPV);
router.post('/credit', authMiddleware.verifyAdmin, pvController.creditPV); // admin credits PV
router.post('/debit', authMiddleware.verifyAdmin, pvController.debitPV);

module.exports = router;
