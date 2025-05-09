// backend/routes/eventRoutes.js
const express = require('express');
const {
    createEvent, getEvents, getEventById, updateEvent, deleteEvent, attendEvent, unattendEvent
} = require('../controllers/eventController');
const { protect } = require('../middleware/authMiddleware');
const { uploadEventImage } = require('../middleware/uploadMiddleware');

const router = express.Router();

// Routes are defined logically

router.route('/')
    .post(protect, uploadEventImage, createEvent) // Create needs login & handles upload
    .get(getEvents); // Listing can be public or add protect middleware

router.route('/:eventId')
    .get(getEventById) // Getting details can be public or add protect
    .put(protect, uploadEventImage, updateEvent) // Updating needs login & handles upload
    .delete(protect, deleteEvent); // Deleting requires login (auth check in controller)

router.route('/:eventId/attend')
    .post(protect, attendEvent) // Attending requires login
    .delete(protect, unattendEvent); // Unattending requires login

module.exports = router;