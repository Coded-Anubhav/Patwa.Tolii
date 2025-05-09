// routes/adminRoutes.js
const express = require('express');
const {
    getPendingUsers,
    approveUser,
    rejectUser,
    getAllUsers
    // Import other admin controllers if added (e.g., deleteUser, banUser)
} = require('../controllers/adminController');
const { protect, admin } = require('../middleware/authMiddleware'); // Import BOTH middlewares

const router = express.Router();

// --- Apply Middleware to ALL routes in this file ---
// Any request to a route defined below MUST first pass 'protect' (be logged in)
// AND then pass 'admin' (the logged-in user must have isAdmin=true).
router.use(protect, admin);


// --- Admin Routes ---

// GET /api/admin/pending-users - List users awaiting verification
router.get('/pending-users', getPendingUsers);

// POST /api/admin/users/:userId/approve - Approve a specific user's verification
router.post('/users/:userId/approve', approveUser);

// DELETE /api/admin/users/:userId/reject - Reject (and delete) a specific user's registration
router.delete('/users/:userId/reject', rejectUser);

// GET /api/admin/users - Get a list of all users (for admin dashboard)
router.get('/users', getAllUsers);

// Optional: Add routes for deleting verified users, banning, making admin, etc.
// Example: router.delete('/users/:userId', deleteUser);
// Example: router.post('/users/:userId/ban', banUser);


module.exports = router;