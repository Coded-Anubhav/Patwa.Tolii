// backend/middleware/uploadMiddleware.js
const multer = require('multer');

// Use memory storage - files will be available as Buffer objects in req.file.buffer / req.files.[fieldname][0].buffer
const storage = multer.memoryStorage();

// --- File Filters ---
const imageFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true); // Accept image
    } else {
        // Reject non-image with a specific Multer error
        cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only image files are allowed!'), false);
    }
};

const mediaFileFilter = (req, file, cb) => { // Allows Images and Videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true); // Accept image or video
    } else {
        cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only image or video files are allowed!'), false);
    }
};

// --- Define File Size Limits (Example values - check Cloudinary free tier limits) ---
const FIVE_MB = 5 * 1024 * 1024;
const FIFTY_MB = 50 * 1024 * 1024; // Might be too large for free tier video
const TEN_MB = 10 * 1024 * 1024;
const TWENTY_FIVE_MB = 25 * 1024 * 1024; // More reasonable story video limit?

// --- Multer Instances with Memory Storage and Limits ---

// For single profile picture upload, field name 'profilePic'
const uploadProfilePic = multer({
    storage: storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: FIVE_MB }
}).single('profilePic');

// For post media (image OR video), field names 'image' and 'video'
const uploadPostMedia = multer({
    storage: storage,
    fileFilter: mediaFileFilter,
    limits: { fileSize: FIFTY_MB } // Be cautious with video size limit
}).fields([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 }
]);

// For single story media file (image or video), field name 'storyMedia'
const uploadStoryMedia = multer({
    storage: storage,
    fileFilter: mediaFileFilter,
    limits: { fileSize: TWENTY_FIVE_MB } // Adjusted limit for stories
}).single('storyMedia');

// For single event image, field name 'eventImage'
const uploadEventImage = multer({
    storage: storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: TEN_MB }
}).single('eventImage');

// For single business image, field name 'businessImage'
const uploadBusinessImage = multer({
    storage: storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: TEN_MB }
}).single('businessImage');


// Export all configured middleware instances
module.exports = {
    uploadProfilePic,
    uploadPostMedia,
    uploadStoryMedia,
    uploadEventImage,
    uploadBusinessImage
};