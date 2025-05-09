// routes/authRoutes.js
const express = require('express');
const { signup, login, checkStatus } = require('../controllers/authController');
const { uploadProfilePic } = require('../middleware/uploadMiddleware'); // For handling profile pic on signup

const router = express.Router();

// --- Public Routes ---

// POST /api/auth/signup
// Uses uploadProfilePic middleware to handle potential 'profilePic' file upload in multipart/form-data
router.post('/signup', uploadProfilePic, signup);

// POST /api/auth/login
// Expects JSON body { username, password }
router.post('/login', login);

// GET /api/auth/status/:username
// Checks if a user account (identified by username) is verified
router.get('/status/:username', checkStatus);


// Optional: Add routes for password reset requests, email verification etc. later


module.exports = router;