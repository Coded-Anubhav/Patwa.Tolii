// backend/routes/businessRoutes.js
const express = require('express');
const {
    createBusiness, getBusinesses, getBusinessById, updateBusiness, deleteBusiness
} = require('../controllers/businessController');
const { protect } = require('../middleware/authMiddleware');
const { uploadBusinessImage } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.route('/')
    .post(protect, uploadBusinessImage, createBusiness) // Create needs login & handles upload
    .get(getBusinesses); // Listing can be public or add protect

router.route('/:businessId')
    .get(getBusinessById) // Details can be public or add protect
    .put(protect, uploadBusinessImage, updateBusiness) // Updating needs login & handles upload
    .delete(protect, deleteBusiness); // Deleting needs login (auth check in controller)

module.exports = router;