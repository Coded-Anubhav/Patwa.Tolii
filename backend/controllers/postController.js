// backend/controllers/postController.js
const Post = require('../models/Post');
const User = require('../models/User');
const mongoose = require('mongoose');
const { uploadToCloudinary, deleteFromCloudinary, getPublicIdFromUrl } = require('./cloudinaryHelper'); // Import helper

/**
 * @desc    Create a new post
 * @route   POST /api/posts
 * @access  Private
 * @expects Multipart/form-data
 */
exports.createPost = async (req, res, next) => {
    const { content } = req.body;
    const userId = req.user.id;
    const imageFile = req.files?.image?.[0];
    const videoFile = req.files?.video?.[0];

    if (!content && !imageFile && !videoFile) {
        return next(new Error('Post must contain text content or media.'));
    }

    try {
        let uploadResult = null;
        let mediaUrl = null;
        let mediaPublicId = null;
        let postMediaType = null;

        // Upload media to Cloudinary (prioritize image if both sent)
        if (imageFile) {
            postMediaType = 'image';
            uploadResult = await uploadToCloudinary(imageFile, 'patwa_toli/posts');
        } else if (videoFile) {
            postMediaType = 'video';
            uploadResult = await uploadToCloudinary(videoFile, 'patwa_toli/posts');
        }

        // Check for successful upload if media was provided
        if ((imageFile || videoFile) && (!uploadResult?.secure_url || !uploadResult?.public_id)) {
             throw new Error(`Cloudinary upload failed for post ${postMediaType || 'media'}.`);
        }

        if (uploadResult) {
            mediaUrl = uploadResult.secure_url;
            mediaPublicId = uploadResult.public_id;
            console.log(`Uploaded Post ${postMediaType || 'Media'}:`, mediaUrl);
        }

        // Prepare post data for saving
        const newPostData = {
            user: userId,
            content: content || '',
            image: postMediaType === 'image' ? mediaUrl : undefined,
            video: postMediaType === 'video' ? mediaUrl : undefined,
             // Storing public_id in DB simplifies deletion but increases storage.
             // Alternatively, parse from URL during deletion. Let's store it for simplicity here.
             mediaPublicId: mediaPublicId // Add this field to your Post model if you want to store it
        };

         // *** IMPORTANT: Ensure your Post model schema includes `mediaPublicId: { type: String }` if you store it ***


        const post = new Post(newPostData);
        const savedPost = await post.save(); // DB save

        // Populate user details for the response
        const populatedPost = await Post.findById(savedPost._id)
                                        .populate('user', 'username fullname profilePic _id');

        res.status(201).json({
            success: true,
            message: "Post created successfully.",
            post: populatedPost
        });

    } catch (error) {
        console.error('Create Post Controller Error (Cloudinary):', error);
        // Note: No local file cleanup needed with memoryStorage
        next(error);
    }
};


/**
 * @desc    Get posts for the user's feed
 * @route   GET /api/posts/feed
 * @access  Private
 */
exports.getFeedPosts = async (req, res, next) => {
    const currentUserId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    try {
        const currentUser = await User.findById(currentUserId).select('following');
        if (!currentUser) return next(new Error('User not found.'));

        const feedUserIds = [currentUserId, ...(currentUser.following || [])];

        const postsQuery = Post.find({ user: { $in: feedUserIds } })
            .populate('user', 'username fullname profilePic _id')
            .populate({ path: 'comments.user', select: 'username fullname profilePic _id' })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const [posts, totalPosts] = await Promise.all([
            postsQuery.lean().exec(), // Use lean for potentially better performance on reads
            Post.countDocuments({ user: { $in: feedUserIds } })
        ]);

        // Manually add likeCount and commentCount using virtual logic if lean() disables them
         const postsWithCounts = posts.map(post => ({
             ...post,
             likeCount: post.likes?.length || 0,
             commentCount: post.comments?.length || 0
         }));

        const totalPages = Math.ceil(totalPosts / limit);

        res.status(200).json({
            success: true,
             posts: postsWithCounts, // Send posts with counts
            pagination: { currentPage: page, totalPages, totalPosts }
        });
    } catch (error) { console.error('Get Feed Posts Error:', error); next(error); }
};


/**
 * @desc    Get a single post by ID
 * @route   GET /api/posts/:postId
 * @access  Private (or Public)
 */
exports.getPostById = async (req, res, next) => {
    const postId = req.params.postId;
    if (!mongoose.Types.ObjectId.isValid(postId)) return next(new Error('Invalid post ID.'));

    try {
        const post = await Post.findById(postId)
                                .populate('user', 'username fullname profilePic _id')
                                .populate('likes', 'username fullname profilePic _id') // Users who liked
                                .populate({ path: 'comments.user', select: 'username fullname profilePic _id' })
                                .lean(); // Use lean for performance

        if (!post) { const err = new Error('Post not found.'); err.statusCode = 404; return next(err); }

         // Add virtual counts manually if using lean()
         post.likeCount = post.likes?.length || 0;
         post.commentCount = post.comments?.length || 0;

        res.status(200).json({ success: true, post });
    } catch (error) { console.error('Get Post By ID Error:', error); next(error); }
};

/**
 * @desc    Like a post
 * @route   POST /api/posts/:postId/like
 * @access  Private
 */
exports.likePost = async (req, res, next) => {
    const postId = req.params.postId;
    const userId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) return next(new Error('Invalid post ID.'));

    try {
        // Use findOneAndUpdate for atomic update
        const updatedPost = await Post.findByIdAndUpdate(
            postId,
            { $addToSet: { likes: userId } }, // Add user ID only if not present
            { new: true } // Return the modified document
        ).select('likes'); // Select only likes field for response efficiency

        if (!updatedPost) { const err = new Error('Post not found.'); err.statusCode = 404; return next(err); }

        // TODO: Create Activity/Notification (Consider if this should be async/queued)

        res.status(200).json({ success: true, message: 'Post liked.', likes: updatedPost.likes });
    } catch (error) { console.error('Like Post Error:', error); next(error); }
};

/**
 * @desc    Unlike a post
 * @route   DELETE /api/posts/:postId/like
 * @access  Private
 */
exports.unlikePost = async (req, res, next) => {
    const postId = req.params.postId;
    const userId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) return next(new Error('Invalid post ID.'));

    try {
        const updatedPost = await Post.findByIdAndUpdate(
            postId,
            { $pull: { likes: userId } }, // Remove user ID from likes array
            { new: true }
        ).select('likes');

        if (!updatedPost) { const err = new Error('Post not found.'); err.statusCode = 404; return next(err); }

        // TODO: Delete 'like' activity if needed

        res.status(200).json({ success: true, message: 'Post unliked.', likes: updatedPost.likes });
    } catch (error) { console.error('Unlike Post Error:', error); next(error); }
};

/**
 * @desc    Add a comment to a post
 * @route   POST /api/posts/:postId/comments
 * @access  Private
 */
exports.addComment = async (req, res, next) => {
    const { text } = req.body;
    const postId = req.params.postId;
    const userId = req.user.id;

    if (!text?.trim()) return next(new Error('Comment text cannot be empty.'));
    if (!mongoose.Types.ObjectId.isValid(postId)) return next(new Error('Invalid post ID.'));

    try {
        const newComment = { user: userId, text: text.trim() };

        // Find post and push comment atomically
        const updatedPost = await Post.findByIdAndUpdate(
            postId,
            { $push: { comments: newComment } },
            { new: true, runValidators: true } // Run subdocument validators
        ).populate({ path: 'comments.user', select: 'username fullname profilePic _id' }); // Populate user in the *last added* comment

        if (!updatedPost) { const err = new Error('Post not found.'); err.statusCode = 404; return next(err); }

         // Find the newly added comment (it will be the last one in the array)
         const addedComment = updatedPost.comments[updatedPost.comments.length - 1];

        // TODO: Create Activity/Notification

        res.status(201).json({ success: true, message: "Comment added.", comment: addedComment });
    } catch (error) { console.error('Add Comment Error:', error); next(error); }
};


/**
 * @desc    Delete a post
 * @route   DELETE /api/posts/:postId
 * @access  Private (Owner or Admin)
 */
exports.deletePost = async (req, res, next) => {
     const postId = req.params.postId;
     const userId = req.user.id;

     if (!mongoose.Types.ObjectId.isValid(postId)) return next(new Error('Invalid post ID.'));

    try {
        // Find the post and select fields needed for deletion logic
        const post = await Post.findById(postId).select('user image video mediaPublicId'); // Select fields needed

        if (!post) { const err = new Error('Post not found.'); err.statusCode = 404; return next(err); }
        if (!post.user.equals(userId) && !req.user.isAdmin) { const err = new Error('Forbidden.'); err.statusCode = 403; return next(err); }

        // --- Delete from Cloudinary ---
        // Prioritize deleting using stored publicId if available
         const publicIdToDelete = post.mediaPublicId || getPublicIdFromUrl(post.image || post.video);

        if (publicIdToDelete) {
            try {
                 let resourceType = 'image'; // Default
                 if (post.video) resourceType = 'video'; // Set if video post
                 await deleteFromCloudinary(publicIdToDelete, resourceType);
                 console.log("Cloudinary media deleted for post:", publicIdToDelete);
            } catch (cloudinaryError) {
                console.error(`Non-fatal Cloudinary deletion error for post ${postId}:`, cloudinaryError);
                // Log error but allow DB deletion to proceed
            }
        } else if (post.image || post.video) {
            console.warn(`Could not determine publicId for media on post ${postId}. Manual Cloudinary cleanup might be needed.`);
        }

        // --- Delete the Post Document from DB ---
        await Post.findByIdAndDelete(postId);

         // TODO: Delete comments, likes, activities associated with the post? (Depends on requirements)

        res.status(200).json({ success: true, message: 'Post deleted successfully.' });

    } catch (error) {
        console.error("Delete Post Error:", error);
        next(error);
    }
};

// Add editPost controller function if needed, handling text and potentially replacing media.