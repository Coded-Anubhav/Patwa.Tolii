// backend/routes/storyRoutes.js
const express = require('express');
const { createStory, getStoryFeed, deleteStory } = require('../controllers/storyController');
const { protect } = require('../middleware/authMiddleware');
const { uploadStoryMedia } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.use(protect); // All routes require login

router.route('/')
    .post(uploadStoryMedia, createStory); // Requires file upload middleware first

router.get('/feed', getStoryFeed);

router.delete('/:storyId', deleteStory);

module.exports = router;