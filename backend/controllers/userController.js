// backend/controllers/userController.js
const User = require('../models/User');
const Post = require('../models/Post');
const mongoose = require('mongoose');
const { uploadToCloudinary, deleteFromCloudinary, getPublicIdFromUrl } = require('./cloudinaryHelper'); // Import helper
const DEFAULT_AVATAR_PATH = '/uploads/profile-pics/default_avatar.png'; // Relative path served by backend

/**
 * @desc    Get the profile of the currently logged-in user
 * @route   GET /api/users/me
 * @access  Private
 */
exports.getMyProfile = async (req, res, next) => {
    if (!req.user) return next(new Error('User not found in request context.'));
    try {
        const userProfile = await User.findById(req.user.id)
                                     .select('-password')
                                     .populate('followers', 'username fullname profilePic _id') // Include _id
                                     .populate('following', 'username fullname profilePic _id'); // Include _id
        if (!userProfile) { const err = new Error('User profile not found.'); err.statusCode = 404; return next(err); }
        const postCount = await Post.countDocuments({ user: req.user.id });
        res.status(200).json({ success: true, ...userProfile.toObject(), postCount });
    } catch (error) { console.error('Get My Profile Error:', error); next(error); }
};

/**
 * @desc    Update the profile of the currently logged-in user
 * @route   PUT /api/users/me
 * @access  Private
 * @expects Multipart/form-data
 */
exports.updateMyProfile = async (req, res, next) => {
    const { fullname, fathername, dob, address, phone, email, bio } = req.body;
    const userId = req.user.id;
    const profilePicFile = req.file; // From memory storage

    try {
        const user = await User.findById(userId);
        if (!user) { const err = new Error('User not found.'); err.statusCode = 404; return next(err); }

        const oldProfilePicUrl = user.profilePic;
        const oldPublicId = getPublicIdFromUrl(oldProfilePicUrl); // Get public ID from Cloudinary URL

        // --- Update Text Fields ---
        user.fullname = fullname ?? user.fullname;
        user.fathername = fathername ?? user.fathername;
        user.dob = dob ? new Date(dob) : user.dob;
        user.address = address ?? user.address;
        user.phone = phone ?? user.phone;
        user.bio = bio !== undefined ? bio : user.bio;

        // --- Handle Email Change (Check Uniqueness) ---
        const newEmailLower = email ? email.toLowerCase() : null;
        if (newEmailLower && newEmailLower !== user.email) {
            const emailExists = await User.findOne({ email: newEmailLower, _id: { $ne: userId } });
            if (emailExists) {
                 const err = new Error('Email already in use.'); err.statusCode = 400; return next(err);
            }
            user.email = newEmailLower;
        }

        // --- Handle Profile Picture Update ---
        if (profilePicFile) {
            console.log("Uploading new profile picture to Cloudinary...");
             const uploadResult = await uploadToCloudinary(profilePicFile, 'patwa_toli/profile-pics'); // Upload to specific folder
             if (!uploadResult?.secure_url || !uploadResult?.public_id) {
                 throw new Error('Profile picture upload failed.'); // Throw error if upload fails
            }
             user.profilePic = uploadResult.secure_url; // Update user with Cloudinary URL

             // Delete OLD picture from Cloudinary only AFTER new one is uploaded successfully
             // Don't delete the default placeholder image!
             if (oldPublicId && oldProfilePicUrl !== DEFAULT_AVATAR_PATH) {
                 console.log(`Attempting to delete old profile pic from Cloudinary: ${oldPublicId}`);
                 try {
                     await deleteFromCloudinary(oldPublicId);
                     console.log(`Successfully deleted old profile pic: ${oldPublicId}`);
                 } catch (delErr) {
                      // Log deletion error but don't fail the update operation
                      console.error("Non-fatal: Error deleting old profile pic from Cloudinary:", delErr);
                 }
             }
        }

        // --- Save User ---
        const updatedUser = await user.save(); // Mongoose validation runs here

        // --- Fetch Updated Profile for Response ---
        // Re-fetch to get populated fields correctly after save
         const responseProfile = await User.findById(updatedUser._id)
                                            .select('-password')
                                            .populate('followers', 'username fullname profilePic _id')
                                            .populate('following', 'username fullname profilePic _id');

         const postCount = await Post.countDocuments({ user: updatedUser._id });

        // --- Respond ---
        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            ...responseProfile.toObject(), // Use toObject for virtuals like followerCount
            postCount
        });

    } catch (error) {
        console.error('Update Profile Controller Error (Cloudinary):', error);
        // Note: No local file cleanup needed with memoryStorage
        next(error); // Pass to global handler
    }
};


/**
 * @desc    Get another user's profile by their username
 * @route   GET /api/users/:username
 * @access  Private
 */
exports.getUserProfile = async (req, res, next) => {
    const requestedUsername = req.params.username?.toLowerCase();
    const loggedInUserId = req.user ? req.user.id : null;

    if (!requestedUsername) return next(new Error('Username parameter missing.'));

    try {
        const user = await User.findOne({ username: requestedUsername })
                               .select('-password')
                               .populate('followers', 'username fullname profilePic _id')
                               .populate('following', 'username fullname profilePic _id');
        if (!user) { const err = new Error('User not found.'); err.statusCode = 404; return next(err); }
        if (!user.verified && (!req.user || !req.user.isAdmin)) { const err = new Error('User profile not available.'); err.statusCode = 404; return next(err); }

        const postCount = await Post.countDocuments({ user: user._id });
        const posts = await Post.find({ user: user._id })
                                .sort({ createdAt: -1 }).limit(15)
                                .populate('user', 'username fullname profilePic'); // Populate post author

        let isFollowing = false;
        if (loggedInUserId) isFollowing = user.followers.some(follower => follower._id.equals(loggedInUserId));

        res.status(200).json({ success: true, ...user.toObject(), postCount, posts, isFollowing });
    } catch (error) { console.error('Get User Profile Error:', error); next(error); }
};


/**
 * @desc    Follow another user
 * @route   POST /api/users/:userId/follow
 * @access  Private
 */
exports.followUser = async (req, res, next) => {
    const userIdToFollow = req.params.userId;
    const currentUserId = req.user.id;

    if (userIdToFollow === currentUserId) return next(new Error("Cannot follow yourself."));
    if (!mongoose.Types.ObjectId.isValid(userIdToFollow)) return next(new Error('Invalid user ID.'));

    try {
        const [userToFollow, currentUser] = await Promise.all([
            User.findById(userIdToFollow).select('followers username verified'), // Select needed fields
            User.findById(currentUserId).select('following')
        ]);
        if (!userToFollow || !currentUser) { const err = new Error('User not found.'); err.statusCode = 404; return next(err); }
        if (!userToFollow.verified) return next(new Error('Cannot follow an unverified user.')); // Optional check

        // --- Use $addToSet for atomic and idempotent update ---
        const updatedCurrentUser = await User.findByIdAndUpdate(currentUserId,
            { $addToSet: { following: userIdToFollow } }, { new: true }
        );
        const updatedTargetUser = await User.findByIdAndUpdate(userIdToFollow,
            { $addToSet: { followers: currentUserId } }, { new: true }
        );

        // Check if update actually happened (optional, $addToSet doesn't error if already present)
        const nowFollowing = updatedCurrentUser.following.includes(userIdToFollow);
        if (!nowFollowing) console.warn(`Follow operation: ${currentUserId} already following ${userIdToFollow}.`); // Should ideally not happen if frontend disables button

        // TODO: Create Activity/Notification

        res.status(200).json({ success: true, message: `Followed ${userToFollow.username}.` });
    } catch (error) { console.error('Follow User Error:', error); next(error); }
};

/**
 * @desc    Unfollow another user
 * @route   DELETE /api/users/:userId/follow
 * @access  Private
 */
exports.unfollowUser = async (req, res, next) => {
    const userIdToUnfollow = req.params.userId;
    const currentUserId = req.user.id;

    if (userIdToUnfollow === currentUserId) return next(new Error("Cannot unfollow yourself."));
    if (!mongoose.Types.ObjectId.isValid(userIdToUnfollow)) return next(new Error('Invalid user ID.'));

    try {
        const [userToUnfollow, currentUser] = await Promise.all([
            User.findById(userIdToUnfollow).select('username'), // Select needed fields
            User.findById(currentUserId).select('following') // Ensure 'following' is available
        ]);

        if (!userToUnfollow || !currentUser) { const err = new Error('User not found.'); err.statusCode = 404; return next(err); }

         // --- Use $pull for atomic removal ---
         const updatedCurrentUser = await User.findByIdAndUpdate(currentUserId,
            { $pull: { following: userIdToUnfollow } }, { new: true }
        );
         const updatedTargetUser = await User.findByIdAndUpdate(userIdToUnfollow,
             { $pull: { followers: currentUserId } }, { new: true }
         );

        // Check if user was actually in the list (optional)
        const stillFollowing = updatedCurrentUser.following.includes(userIdToUnfollow);
        if (stillFollowing) console.warn(`Unfollow op: ${currentUserId} failed to remove ${userIdToUnfollow} (or already removed).`);


        // TODO: Remove Activity/Notification if needed

        res.status(200).json({ success: true, message: `Unfollowed ${userToUnfollow.username}.` });
    } catch (error) { console.error('Unfollow User Error:', error); next(error); }
};


/**
 * @desc    Get suggested users to follow
 * @route   GET /api/users/suggestions
 * @access  Private
 */
exports.getUserSuggestions = async (req, res, next) => {
    const currentUserId = req.user.id;
    const limit = parseInt(req.query.limit) || 5;

    try {
        const currentUser = await User.findById(currentUserId).select('following');
        if (!currentUser) return next(new Error('Current user not found.'));

        const excludeIds = [currentUserId, ...(currentUser.following || [])];

        // Find verified users not followed, limit, select needed fields
        const suggestions = await User.find({ _id: { $nin: excludeIds }, verified: true })
            .limit(limit)
             // Add more sophisticated suggestion logic here later (e.g., common connections)
             .sort({ createdAt: -1 }) // Example sort: newest users first? Maybe random? .aggregate([{ $sample: { size: limit } }])
            .select('username fullname profilePic _id'); // Include _id for follow actions

        res.status(200).json({ success: true, suggestions });
    } catch (error) { console.error('Get Suggestions Error:', error); next(error); }
};