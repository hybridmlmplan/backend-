const express = require('express');
const router = express.Router();
const genealogyController = require('../controllers/genealogyController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/tree/:userId', authMiddleware.protect, genealogyController.getTreeByUser);
router.post('/place-user', authMiddleware.verifyAdmin, genealogyController.placeUserInTree); // placement API
router.get('/downline/:userId/:level?', authMiddleware.protect, genealogyController.getDownline);

module.exports = router;
