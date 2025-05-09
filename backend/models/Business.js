// backend/models/Business.js
const mongoose = require('mongoose');

const BusinessSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Business name is required'],
        trim: true,
        index: true,
        maxlength: [100, 'Business name too long']
    },
    owner: { // User who submitted or owns the listing
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    description: {
        type: String,
        required: [true, 'Business description is required'],
        trim: true,
        maxlength: [1000, 'Description too long']
    },
    category: {
        type: String,
        required: [true, 'Business category is required'],
        enum: ['Retail', 'Food & Beverage', 'Services', 'Health & Wellness', 'Arts & Crafts', 'Professional', 'Online', 'Other'],
        index: true
    },
    address: {
        type: String,
        required: [true, 'Business address is required']
    },
    phone: {
        type: String
    },
    website: {
        type: String,
        // Basic URL validation (consider a more robust validator package if needed)
        match: [/^(https?:\/\/)?([\w.-]+)(\.[\w.-]+)+([\/\w .-]*)*\/?$/, 'Please provide a valid website URL']
    },
    email: {
        type: String,
         lowercase: true,
         trim: true,
         match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid contact email']
    },
    image: { // Cloudinary Secure URL
        type: String
    },
    imagePublicId: { // Cloudinary Public ID
        type: String
    },
}, {
    timestamps: true
});

module.exports = mongoose.model('Business', BusinessSchema);