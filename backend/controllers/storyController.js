// backend/controllers/storyController.js
const Story = require('../models/Story');
const User = require('../models/User');
const mongoose = require('mongoose');
const { uploadToCloudinary, deleteFromCloudinary, getPublicIdFromUrl } = require('./cloudinaryHelper'); // Import helper

// @desc    Create a new story
// @route   POST /api/stories
// @access  Private
exports.createStory = async (req, res, next) => {
    const userId = req.user.id;
    const caption = req.body.caption;
    const storyMediaFile = req.file; // File from multer memory storage

    if (!storyMediaFile) return next(new Error('Story media file is required.'));
    if (caption && caption.length > 200) return next(new Error('Caption too long.'));

    try {
        // Determine mediaType based on mimetype
        let mediaType;
        if (storyMediaFile.mimetype.startsWith('image')) mediaType = 'image';
        else if (storyMediaFile.mimetype.startsWith('video')) mediaType = 'video';
        else throw new Error('Invalid media type for story.');

        // Upload to Cloudinary
        const uploadResult = await uploadToCloudinary(storyMediaFile, 'patwa_toli/stories');
        if (!uploadResult?.secure_url || !uploadResult?.public_id) {
            throw new Error('Failed to upload story media to Cloudinary.');
        }

        // Calculate expiry
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const newStory = new Story({
            user: userId,
            mediaType,
            mediaUrl: uploadResult.secure_url, // Store Cloudinary URL
            publicId: uploadResult.public_id, // Store public_id for deletion
            caption: caption || '',
            expiresAt
        });

        const savedStory = await newStory.save();
        const populatedStory = await Story.findById(savedStory._id).populate('user', 'username profilePic');

        res.status(201).json({ success: true, message: 'Story created.', story: populatedStory });

    } catch (error) {
        console.error("Create Story Controller Error:", error);
        // Note: No local file cleanup needed with memoryStorage
        next(error);
    }
};

// @desc    Get active stories for user's feed
// @route   GET /api/stories/feed
// @access  Private
exports.getStoryFeed = async (req, res, next) => {
    // ... (Keep the refined logic from previous step that groups by user)
     const currentUserId = req.user.id; const now = new Date();
     try { const currentUser = await User.findById(currentUserId).select('following'); if (!currentUser) return next(new Error('User not found.'));
         const feedUserIds = [currentUserId, ...(currentUser.following || [])];
         const stories = await Story.find({ user: { $in: feedUserIds }, expiresAt: { $gt: now } }) .populate('user', 'username fullname profilePic') .sort({ createdAt: -1 });
         const groupedStories = stories.reduce((acc, story) => { if (!story?.user?._id) return acc; const userIdStr = story.user._id.toString(); if (!acc[userIdStr]) acc[userIdStr] = { user: { _id: story.user._id, username: story.user.username, fullname: story.user.fullname, profilePic: story.user.profilePic }, stories: [] }; acc[userIdStr].stories.push({ _id: story._id, mediaType: story.mediaType, mediaUrl: story.mediaUrl, publicId: story.publicId, caption: story.caption, createdAt: story.createdAt }); return acc; }, {});
         res.status(200).json({ success: true, storyFeed: Object.values(groupedStories) });
     } catch (error) { console.error("Get Story Feed Error:", error); next(error); }
};

// @desc    Delete a story
// @route   DELETE /api/stories/:storyId
// @access  Private (Owner only)
exports.deleteStory = async (req, res, next) => {
    const storyId = req.params.storyId;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(storyId)) return next(new Error('Invalid story ID.'));

    try {
        const story = await Story.findById(storyId);
        if (!story) { const err = new Error('Story not found.'); err.statusCode = 404; return next(err); }
        if (!story.user.equals(userId)) { const err = new Error('Forbidden.'); err.statusCode = 403; return next(err); }

        // --- Delete from Cloudinary using stored publicId ---
        const publicId = story.publicId;
         if (publicId) {
             try {
                 await deleteFromCloudinary(publicId); // Determine resource_type if needed
                 console.log("Cloudinary story media deleted:", publicId);
             } catch (cloudinaryError) {
                  console.error("Cloudinary deletion error (non-fatal):", cloudinaryError);
                  // Log but continue deleting DB record
             }
         } else {
             console.warn(`Missing publicId for story ${storyId}, cannot delete from Cloudinary.`);
         }

        // --- Delete from DB ---
        await story.deleteOne();

        res.status(200).json({ success: true, message: 'Story deleted.' });

    } catch (error) {
        console.error("Delete Story Controller Error:", error);
        next(error);
    }
};