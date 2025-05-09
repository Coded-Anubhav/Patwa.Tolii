// backend/controllers/eventController.js
const Event = require('../models/Event');
const mongoose = require('mongoose');
const { uploadToCloudinary, deleteFromCloudinary, getPublicIdFromUrl } = require('./cloudinaryHelper'); // Import helper

// @desc    Create a new event
// @route   POST /api/events
// @access  Private
exports.createEvent = async (req, res, next) => {
    const { title, description, category, eventDate, location } = req.body;
    const organizerId = req.user.id;
    const eventImageFile = req.file; // File from memory storage

    // --- Validation ---
    if (!title || !description || !eventDate || !location) return next(new Error('Missing required fields.'));
    const parsedDate = new Date(eventDate);
    if (isNaN(parsedDate.getTime())) return next(new Error('Invalid event date.'));
    if (parsedDate < new Date()) return next(new Error('Event date cannot be in the past.'));

    try {
        let imageUploadResult = null;
        if (eventImageFile) {
            imageUploadResult = await uploadToCloudinary(eventImageFile, 'patwa_toli/events');
            if (!imageUploadResult?.secure_url) throw new Error('Image upload failed.');
        }

        const newEventData = {
            title: title.trim(), description: description.trim(),
            category: category || 'Community Gathering', eventDate: parsedDate,
            location: location.trim(), organizer: organizerId,
            attendees: [organizerId],
            image: imageUploadResult?.secure_url, // Store URL
            imagePublicId: imageUploadResult?.public_id // Store Public ID
        };

        const event = new Event(newEventData);
        const savedEvent = await event.save();
        const populatedEvent = await Event.findById(savedEvent._id).populate('organizer', 'username fullname profilePic');

        res.status(201).json({ success: true, message: "Event created.", event: populatedEvent });

    } catch (error) {
        console.error("Create Event Error:", error);
        // Note: No local file cleanup needed
        // If Cloudinary upload failed, the error is thrown before DB save potentially
        next(error);
    }
};

// @desc    Get all upcoming events
// @route   GET /api/events
// @access  Public or Private
exports.getEvents = async (req, res, next) => {
    // ... (Keep refined pagination/filtering logic from previous step) ...
     const now = new Date(); const page = parseInt(req.query.page) || 1; const limit = parseInt(req.query.limit) || 12; const skip = (page - 1) * limit;
     try { const eventsQuery = Event.find({ eventDate: { $gte: now } }).populate('organizer', 'username fullname profilePic').sort({ eventDate: 1 }).skip(skip).limit(limit);
         const [events, totalEvents] = await Promise.all([ eventsQuery.exec(), Event.countDocuments({ eventDate: { $gte: now } }) ]);
         const totalPages = Math.ceil(totalEvents / limit);
         res.status(200).json({ success: true, count: events.length, pagination: { currentPage: page, totalPages, totalEvents }, events: events });
     } catch (error) { console.error("Get Events Error:", error); next(error); }
};

// @desc    Get a single event by ID
// @route   GET /api/events/:eventId
// @access  Public or Private
exports.getEventById = async (req, res, next) => {
     // ... (Keep refined logic from previous step) ...
      const eventId = req.params.eventId; if (!mongoose.Types.ObjectId.isValid(eventId)) return next(new Error('Invalid ID.'));
      try { const event = await Event.findById(eventId).populate('organizer', 'username fullname profilePic email').populate('attendees', 'username fullname profilePic'); if (!event) { const err = new Error('Event not found.'); err.statusCode = 404; return next(err); } res.status(200).json({ success: true, event: event }); } catch (error) { console.error("Get Event By ID Error:", error); next(error); }
};

// @desc    Update an event
// @route   PUT /api/events/:eventId
// @access  Private (Organizer or Admin)
exports.updateEvent = async (req, res, next) => {
    const eventId = req.params.eventId;
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin;
    const eventImageFile = req.file; // New image file?
    const { title, description, category, eventDate, location } = req.body;

    if (!mongoose.Types.ObjectId.isValid(eventId)) return next(new Error('Invalid event ID.'));

    try {
        const event = await Event.findById(eventId);
        if (!event) { const err = new Error('Event not found.'); err.statusCode = 404; return next(err); }
        if (!event.organizer.equals(userId) && !isAdmin) { const err = new Error('Forbidden.'); err.statusCode = 403; return next(err); }

        const oldImagePublicId = event.imagePublicId; // Store old public ID

        // Update fields
        if (title) event.title = title.trim();
        if (description) event.description = description.trim();
        if (category) event.category = category;
        if (location) event.location = location.trim();
        if (eventDate) { const d = new Date(eventDate); if (!isNaN(d.getTime())) event.eventDate = d; }

        // Handle Image Update
        if (eventImageFile) {
            const uploadResult = await uploadToCloudinary(eventImageFile, 'patwa_toli/events');
            if (!uploadResult?.secure_url) throw new Error('Image upload failed.');
            event.image = uploadResult.secure_url;
            event.imagePublicId = uploadResult.public_id;

             // Delete old image from Cloudinary AFTER successful upload of new one
             if (oldImagePublicId) {
                 try { await deleteFromCloudinary(oldImagePublicId); } catch (delErr) { console.error("Non-fatal: Error deleting old event image:", delErr); }
            }
        }

        const updatedEvent = await event.save();
        const populatedEvent = await Event.findById(updatedEvent._id).populate('organizer', 'username fullname profilePic');

        res.status(200).json({ success: true, message: "Event updated.", event: populatedEvent });

    } catch (error) {
        console.error("Update Event Error:", error);
        // Note: No local file cleanup needed
        next(error);
    }
};

// @desc    Delete an event
// @route   DELETE /api/events/:eventId
// @access  Private (Organizer or Admin)
exports.deleteEvent = async (req, res, next) => {
    const eventId = req.params.eventId;
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin;

    if (!mongoose.Types.ObjectId.isValid(eventId)) return next(new Error('Invalid event ID.'));

    try {
        const event = await Event.findById(eventId);
        if (!event) { const err = new Error('Event not found.'); err.statusCode = 404; return next(err); }
        if (!event.organizer.equals(userId) && !isAdmin) { const err = new Error('Forbidden.'); err.statusCode = 403; return next(err); }

        // --- Delete from Cloudinary ---
         const publicId = event.imagePublicId;
         if (publicId) {
             try { await deleteFromCloudinary(publicId); } catch (delErr) { console.error("Non-fatal: Cloudinary delete error:", delErr); }
         }

        // --- Delete from DB ---
        await event.deleteOne();
        res.status(200).json({ success: true, message: 'Event deleted.' });

    } catch (error) {
        console.error("Delete Event Error:", error);
        next(error);
    }
};

// @desc    Attend/RSVP to an event
// @route   POST /api/events/:eventId/attend
// @access  Private
exports.attendEvent = async (req, res, next) => {
     // ... (Keep refined logic using $addToSet from previous step) ...
      const eventId = req.params.eventId; const userId = req.user.id; if (!mongoose.Types.ObjectId.isValid(eventId)) return next(new Error('Invalid ID.'));
      try { const updatedEvent = await Event.findByIdAndUpdate(eventId, { $addToSet: { attendees: userId } }, { new: true }).select('attendees'); if (!updatedEvent) return next(new Error('Event not found.')); res.status(200).json({ success: true, message: 'Attending.', attendees: updatedEvent.attendees }); } catch (error) { console.error("Attend Event Err:", error); next(error); }
};

// @desc    Unattend an event
// @route   DELETE /api/events/:eventId/attend
// @access  Private
exports.unattendEvent = async (req, res, next) => {
      // ... (Keep refined logic using $pull from previous step) ...
       const eventId = req.params.eventId; const userId = req.user.id; if (!mongoose.Types.ObjectId.isValid(eventId)) return next(new Error('Invalid ID.'));
       try { const updatedEvent = await Event.findByIdAndUpdate( eventId, { $pull: { attendees: userId } }, { new: true } ).select('attendees'); if (!updatedEvent) return next(new Error('Event not found.')); res.status(200).json({ success: true, message: 'Removed from attendees.', attendees: updatedEvent.attendees }); } catch (error) { console.error("Unattend Event Err:", error); next(error); }
};