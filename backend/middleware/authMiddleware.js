// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config(); // Access JWT_SECRET

// Middleware to protect routes requiring authentication
const protect = async (req, res, next) => {
    let token;

    // Check if Authorization header exists and starts with 'Bearer'
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // Extract token from "Bearer <token>"
            token = req.headers.authorization.split(' ')[1];

            // Verify the token using the secret
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Find the user associated with the token ID
            // IMPORTANT: Exclude the password field from the user object attached to the request
            req.user = await User.findById(decoded.id).select('-password');

            if (!req.user) {
                // Handle case where user might have been deleted after token issuance
                 return res.status(401).json({ message: 'Not authorized, user not found' });
                // Alternative: Throw an error to be caught by the error handler
                // throw new Error('Not authorized, user not found');
            }
            // User is valid, proceed to the next middleware or route handler
            next();

        } catch (error) {
            console.error('Authentication Error:', error.message);
            // Handle specific JWT errors if needed (e.g., TokenExpiredError, JsonWebTokenError)
            if(error.name === 'TokenExpiredError'){
                 res.status(401).json({ message: 'Not authorized, token expired' });
            } else {
                 res.status(401).json({ message: 'Not authorized, token failed verification' });
            }
            // Alternative: Pass error to global handler: next(new Error('Not authorized, token failed'));
        }
    }

    // If no token is found in the header
    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token provided' });
         // Alternative: next(new Error('Not authorized, no token provided'));
    }
};

// Middleware to restrict routes to admin users
const admin = (req, res, next) => {
    // This middleware MUST run AFTER the 'protect' middleware
    // because it relies on req.user being populated.
    if (req.user && req.user.isAdmin) {
        next(); // User is admin, proceed
    } else {
        res.status(403).json({ message: 'Forbidden: Not authorized as an admin' });
         // Alternative: next(new Error('Forbidden: Not authorized as an admin'));
    }
};


module.exports = { protect, admin };