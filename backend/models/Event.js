// backend/models/Event.js
const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Event title is required'],
        trim: true,
        maxlength: [100, 'Event title too long']
    },
    description: {
        type: String,
        required: [true, 'Event description is required'],
        trim: true,
         maxlength: [1000, 'Event description too long']
    },
    organizer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    image: { // Cloudinary Secure URL
        type: String
    },
    imagePublicId: { // Cloudinary Public ID
        type: String
    },
    category: {
        type: String,
        enum: ['Community Gathering', 'Cultural', 'Workshop', 'Social', 'Business', 'Charity', 'Online', 'Other'],
        default: 'Community Gathering'
    },
    eventDate: {
        type: Date,
        required: [true, 'Event date and time are required'],
        index: true // Index for sorting/filtering
    },
    location: {
        type: String,
        required: [true, 'Event location or link is required']
    },
    attendees: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
}, {
    timestamps: true
});

module.exports = mongoose.model('Event', EventSchema);