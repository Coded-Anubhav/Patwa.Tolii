// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    fullname: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true,
    },
    fathername: {
        type: String,
        required: [true, 'Father\'s name is required'],
        trim: true,
    },
    dob: {
        type: Date,
        required: [true, 'Date of birth is required'],
    },
    address: {
        type: String,
        required: [true, 'Address is required'],
        trim: true,
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        // Optional: Add validation for phone format if needed
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [ // Basic email format validation
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
            'Please fill a valid email address'
        ],
    },
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        lowercase: true,
        trim: true,
        index: true, // Create an index for faster username lookups
        minlength: [3, 'Username must be at least 3 characters long'],
        match: [ // Allow only letters, numbers, and underscores
            /^[a-z0-9_]+$/,
            'Username can only contain lowercase letters, numbers, and underscores'
        ]
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long'],
        select: false, // IMPORTANT: Don't send password back in queries by default
    },
    profilePic: {
        type: String,
        default: '/uploads/profile-pics/default_avatar.png', // Relative path served by server
    },
    bio: {
        type: String,
        default: '',
        maxlength: [250, 'Bio cannot exceed 250 characters'],
    },
    isPatwa: {
        type: Boolean,
        default: false,
    },
    verified: {
        type: Boolean,
        default: false,
        index: true, // Index for admin queries on pending users
    },
    isAdmin: {
        type: Boolean,
        default: false,
    },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    verificationRequestedAt: { // Track when signup occurred for admin sorting
        type: Date,
    },
}, {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
    // Optionally add methods or virtuals here
    toJSON: { virtuals: true }, // Ensure virtuals are included in JSON output
    toObject: { virtuals: true } // Ensure virtuals are included when converting to object
});

// --- VIRTUALS ---
// Example: Get follower count without storing it separately
UserSchema.virtual('followerCount').get(function() {
    return this.followers ? this.followers.length : 0;
});

// Example: Get following count
UserSchema.virtual('followingCount').get(function() {
    return this.following ? this.following.length : 0;
});


// --- MIDDLEWARE (HOOKS) ---

// Hash password BEFORE saving the user document
UserSchema.pre('save', async function (next) {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) {
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err); // Pass error to error handler
    }
});

// --- METHODS ---

// Method to compare entered password with hashed password in DB
// We add this method to the schema so we can call it on user instances
UserSchema.methods.comparePassword = async function (candidatePassword) {
    // 'this.password' won't be available here directly because of `select: false`
    // We need to explicitly select it when finding the user for login
    // Let's modify the login controller later to handle this.
    // For now, assume the password was selected.

    // A better approach for login check: Find user AND select password in controller.
    // Let's keep the method signature, but the implementation relies on password being selected.
    return await bcrypt.compare(candidatePassword, this.password);
};

// Important: Adjust Login Controller!
// The login controller (`authController.js`) needs to modify its User.findOne() query
// to explicitly select the password when checking credentials, like:
// `const user = await User.findOne({ username: username.toLowerCase() }).select('+password');`


module.exports = mongoose.model('User', UserSchema);