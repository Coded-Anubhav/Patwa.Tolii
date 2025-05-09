// controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const fs = require('fs'); // To potentially copy default avatar on signup
const path = require('path');
require('dotenv').config();

// --- Helper Function ---
// Generate JWT Token
const generateToken = (userId) => {
    // The payload should ideally just contain the user ID
    // Avoid putting sensitive information in the payload
    const payload = { id: userId };

    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: '30d', // Sensible expiration time (e.g., 30 days)
    });
};


// --- Route Handlers ---

/**
 * @desc    Register a new user (requests verification)
 * @route   POST /api/auth/signup
 * @access  Public
 * @expects Multipart/form-data due to potential file upload
 */
exports.signup = async (req, res, next) => {
    // Extract user data from request body (available via urlencoded/json middleware AND multer)
    const {
        fullname, fathername, dob, address, phone, email, username, password, isPatwa
    } = req.body;

    // Basic backend validation (complementary to frontend validation)
    if (!fullname || !fathername || !dob || !address || !phone || !email || !username || !password) {
        // Use `next` to pass control to the error handler middleware
        return next(new Error('Please provide all required fields')); // More specific error preferred
    }

    try {
        // --- Check for existing user ---
        // Case-insensitive check for email and username for robustness
        const lowerEmail = email.toLowerCase();
        const lowerUsername = username.toLowerCase();
        const userExists = await User.findOne({ $or: [{ email: lowerEmail }, { username: lowerUsername }] });

        if (userExists) {
             // User exists, determine if it's email or username conflict
             let message = 'User already exists.';
             if (userExists.email === lowerEmail) message = 'Email already registered.';
             if (userExists.username === lowerUsername) message = 'Username already taken.';
             const err = new Error(message);
             err.statusCode = 400; // Bad Request
             return next(err);
        }

        // --- Create new user instance ---
        const user = new User({
            fullname,
            fathername,
            dob: new Date(dob), // Ensure DOB is saved as Date object
            address,
            phone,
            email: lowerEmail, // Store lowercase email
            username: lowerUsername, // Store lowercase username
            password, // Password will be hashed by the pre-save hook in User model
            isPatwa: !!isPatwa, // Convert to boolean
            verified: false, // New users start unverified
            isAdmin: false, // Default to non-admin
            verificationRequestedAt: Date.now() // Mark time of signup request
            // profilePic will be set below if uploaded, otherwise defaults in schema
        });

        // --- Handle profile picture upload ---
        // 'req.file' is populated by multer's 'uploadProfilePic' middleware if a file was uploaded
        if (req.file) {
            // Construct the relative web-accessible path to store in the database
            // Example: /uploads/profile-pics/user-650abc123...-1678886400000.jpg
            user.profilePic = `/uploads/profile-pics/${req.file.filename}`;
        } else {
            // If no picture uploaded, user gets the default path defined in the User model schema
             console.log(`No profile picture uploaded for ${user.username}, using default.`);
             // No action needed here if schema default is sufficient.
             // If you wanted a unique copy of the default avatar per user, you'd copy it here.
        }

        // --- Save the user to the database ---
        await user.save(); // Mongoose validation and pre-save hook (hashing) runs here

        // --- Respond ---
        // DO NOT send back the password hash or sensitive info
        // DO NOT send a token yet - user needs verification
        res.status(201).json({
            success: true,
            message: 'Registration successful! Your account is pending verification by an administrator.',
            // Optional: Send back some non-sensitive user ID if frontend needs it immediately
             // userId: user._id
        });

    } catch (error) {
        console.error('Signup Controller Error:', error);
        // Check if the error is related to file upload (e.g., file too large) that Multer might pass on
        if (req.file && error.code) { // Check if file exists and error has a code (like LIMIT_FILE_SIZE)
            // Attempt to delete the partially uploaded file to clean up
            fs.unlink(req.file.path, (unlinkErr) => {
                if (unlinkErr) console.error("Error deleting uploaded file on signup error:", unlinkErr);
            });
        }
        // Pass error to the global error handler
        next(error);
    }
};


/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 * @expects JSON body: { username, password }
 */
exports.login = async (req, res, next) => {
    const { username, password } = req.body;

    if (!username || !password) {
         const err = new Error('Please provide username and password');
         err.statusCode = 400;
         return next(err);
    }

    try {
        // --- Find user by username (case-insensitive) ---
        // IMPORTANT: Select the password field explicitly because it's excluded by default in the model
        const user = await User.findOne({ username: username.toLowerCase() }).select('+password');

        if (!user) {
             const err = new Error('Invalid credentials'); // Generic message for security
             err.statusCode = 401; // Unauthorized
             return next(err);
        }

        // --- Compare provided password with stored hash ---
        // Now we can use the method because we selected the password
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            const err = new Error('Invalid credentials'); // Generic message
            err.statusCode = 401;
            return next(err);
        }

        // --- Check if user account is verified ---
        if (!user.verified) {
             const err = new Error('Account not verified. Please wait for admin approval.');
             err.statusCode = 403; // Forbidden
             return next(err);
        }

         // --- Check if user account is potentially disabled/banned (if you add such a flag) ---
         // if (user.isDisabled) { ... }


        // --- User is valid, verified, and allowed: Generate Token ---
        const token = generateToken(user._id);

        // --- Respond with success ---
        // Send back user details (WITHOUT password) and the token
        res.status(200).json({
            success: true,
            token: token, // Send the generated JWT
            // Send necessary user details for the frontend session
            user: {
                _id: user._id,
                username: user.username,
                fullname: user.fullname,
                email: user.email, // Be mindful about sending email if not strictly necessary
                profilePic: user.profilePic,
                isAdmin: user.isAdmin
                // Add any other fields frontend needs immediately after login
            }
        });

    } catch (error) {
        console.error('Login Controller Error:', error);
        next(error); // Pass to global error handler
    }
};


/**
 * @desc    Check verification status of a user (primarily for the "Verification Pending" screen)
 * @route   GET /api/auth/status/:username
 * @access  Public
 */
exports.checkStatus = async (req, res, next) => {
     const { username } = req.params;
     if (!username) {
          const err = new Error('Username parameter is missing.');
          err.statusCode = 400;
          return next(err);
     }

     try {
         // Find user by username, only select the 'verified' field for efficiency
         const user = await User.findOne({ username: username.toLowerCase() }).select('verified');

         if (!user) {
              const err = new Error('User not found');
              err.statusCode = 404;
              return next(err);
         }

         // Respond with the verification status
         res.status(200).json({
             success: true,
             verified: user.verified
         });

     } catch (error) {
          console.error('Check Status Controller Error:', error);
          next(error); // Pass to global error handler
     }
};