// controllers/adminController.js
const User = require('../models/User');
const fs = require('fs'); // For potentially deleting profile pic of rejected user
const path = require('path');

/**
 * @desc    Get list of users pending verification
 * @route   GET /api/admin/pending-users
 * @access  Private/Admin
 */
exports.getPendingUsers = async (req, res, next) => {
    // Admin check is done by middleware on the route
    try {
        // Find users who are not verified AND have a verification request timestamp
        // This distinguishes them from potentially old, never-verified accounts if cleanup wasn't perfect.
        const pendingUsers = await User.find({ verified: false, verificationRequestedAt: { $ne: null } })
                                       .select('-password') // Exclude password
                                       .sort({ verificationRequestedAt: 1 }); // Show oldest requests first

        res.status(200).json({
            success: true,
            count: pendingUsers.length,
            users: pendingUsers
        });
    } catch (error) {
        console.error('Get Pending Users Error:', error);
        next(error); // Pass to global error handler
    }
};

/**
 * @desc    Approve a user's verification request
 * @route   POST /api/admin/users/:userId/approve
 * @access  Private/Admin
 */
exports.approveUser = async (req, res, next) => {
    const userIdToApprove = req.params.userId;

    try {
        // Find the user by ID
        const user = await User.findById(userIdToApprove);

        if (!user) {
             const err = new Error('User not found.');
             err.statusCode = 404;
             return next(err);
        }

        // Check if already verified
        if (user.verified) {
            const err = new Error('User is already verified.');
            err.statusCode = 400; // Bad request - cannot re-approve
            return next(err);
        }

        // --- Approve the user ---
        user.verified = true;
        user.verificationRequestedAt = undefined; // Clear the request timestamp as it's processed
        const updatedUser = await user.save();

        // TODO: Send notification (email/SMS etc.) to the user about approval

        // --- Respond ---
        res.status(200).json({
             success: true,
             message: `User ${updatedUser.username} approved successfully.`,
             // Optionally return the updated user object (without password)
             // user: { _id: updatedUser._id, username: updatedUser.username, verified: updatedUser.verified }
         });

    } catch (error) {
        console.error('Approve User Error:', error);
        // Handle CastError for invalid ID format
        if (error.name === 'CastError') {
           const err = new Error('User not found (Invalid ID format).');
           err.statusCode = 404;
           return next(err);
        }
        next(error);
    }
};

/**
 * @desc    Reject a user's verification request (Deletes the user record)
 * @route   DELETE /api/admin/users/:userId/reject
 * @access  Private/Admin
 */
exports.rejectUser = async (req, res, next) => {
    const userIdToReject = req.params.userId;

    try {
        // Find the user by ID
        const user = await User.findById(userIdToReject);

        if (!user) {
            const err = new Error('User not found.');
            err.statusCode = 404;
            return next(err);
        }

        // Ensure we are not rejecting an already verified user (use delete endpoint for that)
        if (user.verified) {
             const err = new Error('Cannot reject an already verified user. Use a delete function if needed.');
             err.statusCode = 400;
             return next(err);
        }

        // --- Delete Profile Picture (if not default) ---
        if (user.profilePic && user.profilePic !== '/uploads/profile-pics/default_avatar.png') {
             const profilePicPath = path.join(__dirname, '..', user.profilePic);
             fs.unlink(profilePicPath, (err) => {
                 if (err && err.code !== 'ENOENT') {
                     console.error(`Error deleting profile picture for rejected user (${profilePicPath}):`, err);
                     // Continue with user deletion even if file deletion fails
                 } else if (!err) {
                     console.log(`Deleted profile picture for rejected user: ${profilePicPath}`);
                 }
             });
        }

        // --- Delete the User Record ---
        const deletedUsername = user.username; // Store username for message before deleting
        await User.findByIdAndDelete(userIdToReject);

        // TODO: Send notification (email/SMS etc.) to the user about rejection? (Needs email stored temporarily before delete)

        // --- Respond ---
        res.status(200).json({
             success: true,
             message: `User registration for ${deletedUsername} rejected and record deleted.`
         });

    } catch (error) {
        console.error('Reject User Error:', error);
        if (error.name === 'CastError') {
           const err = new Error('User not found (Invalid ID format).');
           err.statusCode = 404;
           return next(err);
        }
        next(error);
    }
};

/**
 * @desc    Get all users (for admin user management dashboard)
 * @route   GET /api/admin/users
 * @access  Private/Admin
 */
exports.getAllUsers = async (req, res, next) => {
    try {
        // Basic implementation: fetches all users. Add pagination, filtering, sorting for real admin UI.
        // Example: /api/admin/users?page=1&limit=20&sortBy=createdAt&status=verified
        const users = await User.find({})
                                .select('-password') // Exclude passwords
                                .sort({ createdAt: -1 }); // Sort by creation date, newest first

        res.status(200).json({
            success: true,
            count: users.length, // Total count matching filter (without pagination here)
            users: users
        });
    } catch (error) {
        console.error('Get All Users (Admin) Error:', error);
        next(error);
    }
};

// Optional: Add endpoints for admins to delete verified users, ban users, make other users admins, etc.
// Remember to add corresponding routes in adminRoutes.js for any new controllers.