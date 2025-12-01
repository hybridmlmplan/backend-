const express = require('express');
const router = express.Router();
const packageController = require('../controllers/packageController');
const authMiddleware = require('../middleware/authMiddleware');

// public: list packages
router.get('/', packageController.listPackages);

// admin: create package (optional middleware check)
router.post('/', authMiddleware.verifyAdmin, packageController.createPackage);

// get package by id
router.get('/:id', packageController.getPackage);

module.exports = router;
