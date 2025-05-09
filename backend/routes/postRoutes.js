// routes/postRoutes.js
const express = require('express');
const {
    createPost,
    getFeedPosts,
    getPostById,
    likePost,
    unlikePost,
    addComment,
    deletePost
    // Import editPost controller if added
} = require('../controllers/postController');
const { protect } = require('../middleware/authMiddleware'); // Protect most post routes
const { uploadPostMedia } = require('../middleware/uploadMiddleware'); // Handle optional image/video uploads

const router = express.Router();

// --- Protected Routes (Generally require login) ---

// POST /api/posts - Create a new post (handles optional media upload)
router.post('/', protect, uploadPostMedia, createPost);

// GET /api/posts/feed - Get the news feed for the logged-in user
router.get('/feed', protect, getFeedPosts);

// --- Routes for specific posts identified by :postId ---

// GET /api/posts/:postId - Get a single post's details
// Note: Access control (public/private) could be handled inside the controller or with specific middleware
// For now, keeping it protected, assuming only logged-in users can view posts. Adjust if needed.
router.get('/:postId', protect, getPostById);

// DELETE /api/posts/:postId - Delete a post (authorization check in controller)
router.delete('/:postId', protect, deletePost);

// PUT /api/posts/:postId - Edit a post (if implemented)
// router.put('/:postId', protect, /* Add optional media upload */, editPost);


// --- Routes for Liking ---
// POST   /api/posts/:postId/like - Like a specific post
// DELETE /api/posts/:postId/like - Unlike a specific post
router.route('/:postId/like')
    .post(protect, likePost)
    .delete(protect, unlikePost);

// --- Route for Commenting ---
// POST /api/posts/:postId/comments - Add a comment to a specific post
router.post('/:postId/comments', protect, addComment);

// Optional: Add routes for deleting/editing comments if needed
// DELETE /api/posts/:postId/comments/:commentId
// PUT    /api/posts/:postId/comments/:commentId


module.exports = router;