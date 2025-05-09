// backend/server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const multer = require('multer'); // To handle potential Multer errors globally
const connectDB = require('./config/db'); // DB connection function

// --- Load Environment Variables ---
// Make sure .env is loaded BEFORE any files that might need it (like config/cloudinary)
dotenv.config();

// --- Connect to Database ---
connectDB();

// --- Require Route Files ---
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const adminRoutes = require('./routes/adminRoutes');
const storyRoutes = require('./routes/storyRoutes');
const eventRoutes = require('./routes/eventRoutes');
const businessRoutes = require('./routes/businessRoutes');

// --- Initialize Express App ---
const app = express();

// --- Core Middleware ---

// Enable CORS - Configure origins properly for production
app.use(cors({
    origin: '*', // Allow all origins for development - BE SURE TO RESTRICT IN PRODUCTION!
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    // credentials: true // Include if you use cookies/sessions and need cross-origin credentials
}));

// Body Parsers
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies (increase limit if needed)
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies

// --- Static File Serving ---
// Serve the default avatar image locally (even with Cloudinary, keep this for fallback)
// Ensure 'default_avatar.png' exists in 'backend/uploads/profile-pics/'
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve base uploads folder if needed (maybe less necessary now)
app.get('/uploads/profile-pics/default_avatar.png', (req, res) => {
    const defaultAvatarPath = path.join(__dirname, 'uploads', 'profile-pics', 'default_avatar.png');
    res.sendFile(defaultAvatarPath, (err) => {
        if (err && !res.headersSent) {
             console.error("Error sending default avatar:", err);
             res.status(err.status || 404).send('Default avatar not found.');
         }
    });
});

// --- API Route Mounting ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/admin', adminRoutes); // Keep admin routes accessible


// --- Simple Root Route for API Health Check ---
app.get('/', (req, res) => {
    res.send(`Patwa.Toli API is running in ${process.env.NODE_ENV || 'development'} mode.`);
});

// --- Not Found Route (Catch 404s for API paths) ---
app.use('/api/*', (req, res, next) => {
    res.status(404).json({ message: `API endpoint not found: ${req.originalUrl}` });
});

// --- Global Error Handling Middleware (MUST be last) ---
app.use((err, req, res, next) => {
    console.error("-------------------- GLOBAL ERROR HANDLER --------------------");
    console.error(`Timestamp: ${new Date().toISOString()}`);
    console.error(`Route: ${req.method} ${req.originalUrl}`);
    console.error(`Error: ${err.message}`);
    if (process.env.NODE_ENV === 'development') {
        console.error("Stack:", err.stack); // Show stack trace only in development
    }
    console.error("------------------------------------------------------------");

    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    // Customize error messages based on error type
    if (err instanceof multer.MulterError) {
        statusCode = 400;
        message = `File Upload Error: ${err.code} - ${err.message}`;
    } else if (err.name === 'ValidationError') {
        statusCode = 400;
        message = Object.values(err.errors).map(e => e.message).join(', ');
    } else if (err.name === 'CastError' && err.kind === 'ObjectId') {
        statusCode = 404;
        message = `Resource not found. Invalid ID format provided for path: ${err.path}`;
    } else if (err.code === 11000) { // Mongoose duplicate key
        statusCode = 400;
        const field = Object.keys(err.keyValue)[0];
        message = `An account already exists with this ${field}.`;
    }
    // Add more specific error checks as needed...

    // Prevent leaking sensitive details in production
    if (statusCode === 500 && process.env.NODE_ENV === 'production') {
        message = 'An unexpected internal server error occurred.';
    }

    res.status(statusCode).json({
        success: false,
        message: message,
        // Optionally add error code or type
        // errorCode: err.code,
        // errorName: err.name
    });
});


// --- Start Server ---
const PORT = process.env.PORT || 5000;

app.listen(
    PORT,
    () => console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`)
);

// Optional: Handle Unhandled Promise Rejections (good practice)
process.on('unhandledRejection', (err, promise) => {
    console.error(`Unhandled Rejection: ${err.message}`);
    console.error(err.stack);
    // Optional: Close server gracefully in production
    // server.close(() => process.exit(1));
});