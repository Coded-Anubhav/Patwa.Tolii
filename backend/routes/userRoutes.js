// routes/userRoutes.js
const express = require('express');
const {
    getMyProfile,
    updateMyProfile,
    getUserProfile,
    followUser,
    unfollowUser,
    getUserSuggestions
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware'); // Middleware to ensure user is logged in
const { uploadProfilePic } = require('../middleware/uploadMiddleware'); // For handling profile pic update

const router = express.Router();

// --- Protected Routes (Require Authentication) ---

// GET /api/users/me - Get current user's profile
// PUT /api/users/me - Update current user's profile (handles optional profile pic upload)
router.route('/me')
    .get(protect, getMyProfile)
    .put(protect, uploadProfilePic, updateMyProfile);

// GET /api/users/suggestions - Get suggested users to follow
router.get('/suggestions', protect, getUserSuggestions);

// --- Routes for following/unfollowing ---
// POST   /api/users/:userId/follow - Follow a user identified by userId
// DELETE /api/users/:userId/follow - Unfollow a user identified by userId
router.route('/:userId/follow')
    .post(protect, followUser)
    .delete(protect, unfollowUser);


// GET /api/users/:username - Get a specific user's profile by their username
// IMPORTANT: This route uses :username parameter. Keep it AFTER specific routes like '/me' or '/suggestions'
// to avoid '/me' being interpreted as a username.
// Decide if this should be public or private (protected). Currently set to protected.
router.get('/:username', protect, getUserProfile);


module.exports = router;