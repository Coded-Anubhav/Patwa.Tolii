// backend/controllers/cloudinaryHelper.js
const cloudinary = require('../config/cloudinary'); // Require cloudinary config
const DatauriParser = require('datauri/parser');
const path = require('path');

const parser = new DatauriParser();

// Formats buffer from multer memory storage to data URI string
const formatBufferToDataURI = (file) => {
    if (!file || !file.buffer) return null;
    return parser.format(path.extname(file.originalname).toString(), file.buffer);
};

/**
 * Uploads a file buffer to Cloudinary.
 * @param {object} file - The file object from multer (req.file). Must contain 'buffer' and 'originalname'.
 * @param {string} folder - The Cloudinary folder name (e.g., 'patwa_toli/posts').
 * @returns {Promise<object|null>} Cloudinary upload result object or null if no file.
 * @throws {Error} If formatting or upload fails.
 */
const uploadToCloudinary = (file, folder) => {
    return new Promise((resolve, reject) => {
        if (!file) return resolve(null); // No file provided

        const dataUri = formatBufferToDataURI(file);
        if (!dataUri?.content) {
            console.error("Failed to create data URI from buffer for file:", file.originalname);
            return reject(new Error('Failed to process file buffer.'));
        }

        console.log(`Uploading ${file.mimetype} to Cloudinary folder: ${folder}`);
        cloudinary.uploader.upload(dataUri.content, {
                folder: folder,
                resource_type: 'auto', // Automatically detect image/video
                 // Add transformations or optimizations here if needed
                 // e.g., transformation: [{ width: 1000, height: 1000, crop: "limit" }]
            })
            .then(result => {
                console.log('Cloudinary Upload Success:', result.public_id);
                resolve({ secure_url: result.secure_url, public_id: result.public_id });
            })
            .catch(error => {
                console.error('Cloudinary Upload Error:', error);
                reject(new Error(`Cloudinary upload failed: ${error.message}`));
            });
    });
};

/**
 * Extracts the public_id from a Cloudinary URL.
 * @param {string} url - The Cloudinary media URL.
 * @returns {string|null} The extracted public_id or null if invalid URL.
 */
const getPublicIdFromUrl = (url) => {
    if (!url || !url.includes('cloudinary.com')) return null;
    // Example: https://res.cloudinary.com/demo/image/upload/v123/folder/file.jpg
    //          -> folder/file
    // Example: https://res.cloudinary.com/demo/video/upload/v123/folder/file.mp4
    //          -> folder/file
    try {
        const parts = url.split('/');
        const uploadIndex = parts.indexOf('upload');
        const transformationIndex = parts.findIndex(part => part.startsWith('v') && !isNaN(parseInt(part.substring(1)))); // Find version number like v123...

        // Ensure expected structure parts exist
        if (uploadIndex === -1 || transformationIndex === -1 || transformationIndex <= uploadIndex || transformationIndex + 1 >= parts.length) {
             console.warn("Could not determine public_id structure from URL:", url);
             return null; // Structure doesn't match expected pattern
        }

        // Get the part after the version number until the extension
        const publicIdWithExt = parts.slice(transformationIndex + 1).join('/');
        const lastDotIndex = publicIdWithExt.lastIndexOf('.');
        return lastDotIndex === -1 ? publicIdWithExt : publicIdWithExt.substring(0, lastDotIndex);
    } catch (e) {
        console.error("Error extracting public ID from URL:", url, e);
        return null;
    }
};

/**
 * Deletes a resource from Cloudinary using its public_id.
 * @param {string} publicId - The public_id of the resource to delete.
 * @param {string} resourceType - Optional: 'image', 'video', or 'raw'. Defaults to 'image'.
 * @returns {Promise<object|null>} Cloudinary deletion result or null if no publicId.
 * @throws {Error} If deletion fails.
 */
const deleteFromCloudinary = (publicId, resourceType = 'auto') => { // Default to auto-detect based on public ID? Might need adjustment.
    return new Promise((resolve, reject) => {
        if (!publicId) return resolve({ result: 'ok', message: 'No publicId provided.' }); // Resolve successfully if nothing to delete

        console.log(`Deleting from Cloudinary: ${publicId} (type: ${resourceType})`);
        cloudinary.uploader.destroy(publicId, { resource_type: resourceType })
            .then(result => {
                console.log('Cloudinary Deletion Result:', result);
                 if (result.result !== 'ok' && result.result !== 'not found') { // Handle 'not found' gracefully
                     // Log unexpected results but resolve to avoid stopping other operations
                     console.warn("Cloudinary deletion warning:", result);
                     // reject(new Error(`Cloudinary deletion failed: ${result.result}`));
                 }
                resolve(result);
            })
            .catch(error => {
                console.error('Cloudinary Deletion Error:', error);
                // Don't necessarily reject the whole operation if delete fails (e.g., file already gone)
                // resolve({ result: 'error', message: error.message }); // Resolve with error status instead?
                 reject(new Error(`Cloudinary deletion error: ${error.message}`)); // Or reject to signal failure
            });
    });
};


module.exports = {
    uploadToCloudinary,
    deleteFromCloudinary,
    getPublicIdFromUrl,
    formatBufferToDataURI // Keep if needed directly, though usually internal to uploadToCloudinary
};