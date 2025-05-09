// backend/controllers/businessController.js
const Business = require('../models/Business');
const User = require('../models/User'); // For potential auth checks
const mongoose = require('mongoose');
const { uploadToCloudinary, deleteFromCloudinary, getPublicIdFromUrl } = require('./cloudinaryHelper'); // Import helper

/**
 * @desc    Create a new business listing
 * @route   POST /api/businesses
 * @access  Private (protected route)
 * @expects Multipart/form-data: required fields name, description, category, address; optional phone, website, email, businessImage
 */
exports.createBusiness = async (req, res, next) => {
    const { name, description, category, address, phone, website, email } = req.body;
    const ownerId = req.user.id; // User submitting the listing
    const businessImageFile = req.file; // File from multer memory storage

    // --- Validation ---
    if (!name || !description || !category || !address) {
        // No local file to clean up here with memory storage if validation fails before Cloudinary
        return next(new Error('Missing required fields (name, description, category, address).'));
    }
     // Example more specific validation
     if (category && !Business.schema.path('category').enumValues.includes(category)) {
         return next(new Error(`Invalid category: ${category}. Must be one of ${Business.schema.path('category').enumValues.join(', ')}.`));
     }
     if (email && !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
         return next(new Error('Invalid email format provided.'));
     }
     if (website && !/^(https?:\/\/)?([\w.-]+)(\.[\w.-]+)+([\/\w .-]*)*\/?$/.test(website)) {
        return next(new Error('Invalid website URL format provided.'));
     }


    try {
        // --- Upload Image (if provided) ---
        let imageUploadResult = null;
        if (businessImageFile) {
            imageUploadResult = await uploadToCloudinary(businessImageFile, 'patwa_toli/businesses');
             if (!imageUploadResult?.secure_url || !imageUploadResult?.public_id) {
                 // Even though upload failed, don't save the DB record
                throw new Error('Business image upload to Cloudinary failed.');
             }
        }

        // --- Prepare business data for saving ---
        const newBusinessData = {
            name: name.trim(),
            description: description.trim(),
            category, // Already validated or default will apply if needed
            address: address.trim(),
            phone: phone || undefined, // Store undefined rather than null/empty string if not provided? Or handle in schema.
            website: website || undefined,
            email: email ? email.toLowerCase().trim() : undefined,
            owner: ownerId,
            image: imageUploadResult?.secure_url,       // Store Cloudinary URL
            imagePublicId: imageUploadResult?.public_id // Store Cloudinary Public ID
        };

        // --- Create and save the business listing ---
        const business = new Business(newBusinessData);
        const savedBusiness = await business.save(); // Mongoose validation runs here too

        // --- Populate owner details for response ---
        const populatedBusiness = await Business.findById(savedBusiness._id)
                                              .populate('owner', 'username fullname profilePic _id');

        res.status(201).json({
            success: true,
            message: "Business listing created successfully.",
            business: populatedBusiness
        });

    } catch (error) {
        console.error("Create Business Controller Error:", error);
         // If a Cloudinary upload succeeded but DB save failed, we should ideally delete the uploaded image
         if (error.name !== 'ValidationError' && error.message !== 'Business image upload to Cloudinary failed.' && req.file && error.message.includes('duplicate key')) {
             // More specific error handling needed here based on actual errors encountered
             console.warn("DB save failed after potential Cloudinary upload. Manual cleanup might be needed for:", req.file?.originalname);
         } else if (error.message === 'Business image upload to Cloudinary failed.'){
             // Upload failed before save attempt, nothing extra to do usually
         }
        next(error); // Pass to global error handler
    }
};

/**
 * @desc    Get all business listings (with filtering and pagination)
 * @route   GET /api/businesses
 * @access  Public or Private
 */
exports.getBusinesses = async (req, res, next) => {
    // --- Filtering ---
    const filter = {};
    if (req.query.category && Business.schema.path('category').enumValues.includes(req.query.category)) {
        filter.category = req.query.category; // Filter by valid category
    }
     if (req.query.search) {
        // Basic search on name and description (case-insensitive)
         const searchRegex = new RegExp(req.query.search, 'i');
        filter.$or = [ { name: searchRegex }, { description: searchRegex } ];
    }
    // Add location filtering if implementing GeoJSON later

    // --- Pagination ---
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    try {
        const businessesQuery = Business.find(filter)
            .populate('owner', 'username fullname profilePic _id') // Populate owner info
            .sort({ createdAt: -1 }) // Default sort: newest first
            .skip(skip)
            .limit(limit);

        const [businesses, totalBusinesses] = await Promise.all([
            businessesQuery.lean().exec(), // Use lean for reads
            Business.countDocuments(filter)
        ]);

        const totalPages = Math.ceil(totalBusinesses / limit);

        res.status(200).json({
            success: true,
            count: businesses.length,
            pagination: { currentPage: page, totalPages, totalBusinesses },
            businesses: businesses
        });
    } catch (error) {
        console.error("Get Businesses Controller Error:", error);
        next(error);
    }
};

/**
 * @desc    Get a single business listing by its ID
 * @route   GET /api/businesses/:businessId
 * @access  Public or Private
 */
exports.getBusinessById = async (req, res, next) => {
    const businessId = req.params.businessId;
    if (!mongoose.Types.ObjectId.isValid(businessId)) return next(new Error('Invalid business ID format.'));

    try {
        const business = await Business.findById(businessId)
                                    .populate('owner', 'username fullname profilePic _id email'); // Populate more owner details

        if (!business) { const err = new Error('Business listing not found.'); err.statusCode = 404; return next(err); }

        res.status(200).json({
            success: true,
            business: business
        });
    } catch (error) {
        console.error("Get Business By ID Controller Error:", error);
        next(error);
    }
};

/**
 * @desc    Update a business listing
 * @route   PUT /api/businesses/:businessId
 * @access  Private (Owner or Admin)
 * @expects Multipart/form-data
 */
exports.updateBusiness = async (req, res, next) => {
     const businessId = req.params.businessId;
     const userId = req.user.id;
     const isAdmin = req.user.isAdmin;
     const businessImageFile = req.file;
     const { name, description, category, address, phone, website, email } = req.body;

      if (!mongoose.Types.ObjectId.isValid(businessId)) return next(new Error('Invalid business ID format.'));

     try {
         const business = await Business.findById(businessId);
         if (!business) { const err = new Error('Business listing not found.'); err.statusCode = 404; return next(err); }

         // --- Authorization Check ---
         if (!business.owner.equals(userId) && !isAdmin) { const err = new Error('Forbidden: Not authorized.'); err.statusCode = 403; return next(err); }

         const oldImagePublicId = business.imagePublicId;

         // --- Update fields ---
         if (name) business.name = name.trim();
         if (description) business.description = description.trim();
         if (category && Business.schema.path('category').enumValues.includes(category)) business.category = category;
         if (address) business.address = address.trim();
         // Allow explicitly setting to null/empty
         if (phone !== undefined) business.phone = phone.trim() || null;
         if (website !== undefined) business.website = website.trim() || null;
         if (email !== undefined) business.email = email ? email.toLowerCase().trim() : null;


         // --- Handle Image Update ---
         if (businessImageFile) {
             console.log("Updating business image in Cloudinary...");
             const uploadResult = await uploadToCloudinary(businessImageFile, 'patwa_toli/businesses');
             if (!uploadResult?.secure_url) throw new Error('Business image update failed.');

             business.image = uploadResult.secure_url;
             business.imagePublicId = uploadResult.public_id;

             // Delete OLD image from Cloudinary
             if (oldImagePublicId) {
                 try { await deleteFromCloudinary(oldImagePublicId); } catch (delErr) { console.error("Non-fatal: Error deleting old business image:", delErr); }
             }
         }

         // --- Save updated business ---
        const updatedBusiness = await business.save(); // Mongoose validation runs

         // Populate owner for response
         const populatedBusiness = await Business.findById(updatedBusiness._id)
                                               .populate('owner', 'username fullname profilePic _id');

        res.status(200).json({
            success: true,
            message: "Business listing updated.",
            business: populatedBusiness
        });

     } catch (error) {
         console.error("Update Business Controller Error:", error);
         // Note: No local file cleanup with memoryStorage
         next(error);
     }
};

/**
 * @desc    Delete a business listing
 * @route   DELETE /api/businesses/:businessId
 * @access  Private (Owner or Admin)
 */
exports.deleteBusiness = async (req, res, next) => {
    const businessId = req.params.businessId;
     const userId = req.user.id;
     const isAdmin = req.user.isAdmin;

     if (!mongoose.Types.ObjectId.isValid(businessId)) return next(new Error('Invalid business ID format.'));

    try {
        const business = await Business.findById(businessId);
        if (!business) { const err = new Error('Business listing not found.'); err.statusCode = 404; return next(err); }

        // --- Authorization Check ---
         if (!business.owner.equals(userId) && !isAdmin) { const err = new Error('Forbidden.'); err.statusCode = 403; return next(err); }

        // --- Delete from Cloudinary ---
         const publicIdToDelete = business.imagePublicId;
        if (publicIdToDelete) {
             try { await deleteFromCloudinary(publicIdToDelete); } catch (delErr) { console.error("Non-fatal: Cloudinary delete err:", delErr); }
         } else if (business.image) {
             console.warn(`Missing publicId for image on business ${businessId}. Cannot delete from Cloudinary.`);
         }

        // --- Delete from DB ---
        await Business.findByIdAndDelete(businessId); // Use this for simplicity vs .deleteOne() on instance

        res.status(200).json({
            success: true,
            message: 'Business listing deleted successfully.'
        });

    } catch (error) {
        console.error("Delete Business Controller Error:", error);
        next(error);
    }
};