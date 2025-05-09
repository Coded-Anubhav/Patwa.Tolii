// backend/models/Story.js
const mongoose = require('mongoose');

const StorySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    mediaType: {
        type: String,
        enum: ['image', 'video'],
        required: true
    },
    mediaUrl: { // Cloudinary Secure URL
        type: String,
        required: true
    },
    publicId: { // Cloudinary Public ID for deletion
        type: String,
        required: true
    },
    caption: {
        type: String,
        trim: true,
        maxlength: [200, 'Caption cannot exceed 200 characters']
    },
    expiresAt: {
        type: Date,
        required: true,
         // MongoDB TTL index: Automatically deletes documents 'expireAfterSeconds' after the 'expiresAt' time.
         // expireAfterSeconds: 0 means delete immediately when expiresAt is reached.
        index: { expires: '24h' } // Keep for 24 hours after creation (adjust if expiresAt logic changes)
        // If expiresAt is set to 'Date.now() + 24 hours', this index automatically deletes after 24h
        // index: { expireAfterSeconds: 0 } // Use if expiresAt is set directly to the expiry time
    },
    viewers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
}, {
    timestamps: true // Adds createdAt, updatedAt
});

module.exports = mongoose.model('Story', StorySchema);