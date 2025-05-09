// config/db.js
const mongoose = require('mongoose');
require('dotenv').config(); // Ensures process.env variables are loaded

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // useNewUrlParser: true, // Deprecated - always true now
            // useUnifiedTopology: true, // Deprecated - always true now
            // Mongoose 6+ uses these settings by default. No options needed unless specific requirement.
        });

        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (err) {
        console.error(`MongoDB Connection Error: ${err.message}`);
        console.error(err); // Log the full error for debugging
        // Exit process with failure code
        process.exit(1);
    }
};

module.exports = connectDB;