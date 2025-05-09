// models/Post.js
const mongoose = require('mongoose');

// Subdocument schema for comments
const CommentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: [true, 'Comment text cannot be empty'],
        trim: true,
        maxlength: [500, 'Comment cannot exceed 500 characters']
    },
    // Timestamps for comments (createdAt, updatedAt) are handled within the parent Post's timestamps
    // If specific comment timestamps are needed independent of post update, add { timestamps: true } here
}, { _id: true, timestamps: true }); // Assign IDs and add timestamps to comments themselves


const PostSchema = new mongoose.Schema({
    user: { // The author of the post
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // References the User model
        required: true,
        index: true // Index for quickly finding posts by a user
    },
    content: {
        type: String,
        required: [true, 'Post content cannot be empty'],
        trim: true,
        maxlength: [2000, 'Post content cannot exceed 2000 characters'] // Adjust limit as needed
    },
    image: { // URL/path to an associated image
        type: String,
    },
    video: { // URL/path to an associated video
        type: String,
    },
    audio: { // URL/path to an associated audio file (optional)
       type: String,
    },
    likes: [{ // Array of User IDs who liked the post
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    comments: [CommentSchema], // Array of comment subdocuments
    // Optional: Add visibility settings (e.g., 'public', 'followers', 'private')
    // visibility: {
    //     type: String,
    //     enum: ['public', 'followers', 'private'],
    //     default: 'public'
    // },
    // Optional: Add fields for location tagging
    // location: {
    //    type: { type: String, enum: ['Point'], default: 'Point' },
    //    coordinates: { type: [Number], index: '2dsphere' } // [longitude, latitude]
    //    address: String
    // }
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt for the post
    toJSON: { virtuals: true }, // Ensure virtuals are included in JSON output
    toObject: { virtuals: true } // Ensure virtuals are included when converting to object
});

// --- VIRTUALS ---
// Example: Get like count without storing it separately
PostSchema.virtual('likeCount').get(function() {
    return this.likes ? this.likes.length : 0;
});

// Example: Get comment count
PostSchema.virtual('commentCount').get(function() {
    return this.comments ? this.comments.length : 0;
});

// Optional: Add pre-remove hook to delete associated files from storage if needed

module.exports = mongoose.model('Post', PostSchema);