const multer = require('multer');
const { MAX_UPLOAD_SIZE } = require('../config');

const allowedImageTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
]);

const allowedDocumentTypes = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
]);

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_UPLOAD_SIZE,
        files: 3
    },
    fileFilter: (req, file, callback) => {
        const isPdfUpload = file.fieldname === 'pdfBook';
        const allowedTypes = isPdfUpload
            ? new Set(['application/pdf'])
            : file.fieldname === 'coverImage'
                ? allowedImageTypes
                : allowedDocumentTypes;

        if (!allowedTypes.has(file.mimetype)) {
            return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE'));
        }

        callback(null, true);
    }
});

const dualUploadFields = upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'pdfBook', maxCount: 1 }
]);

const profileUploadFields = upload.fields([
    { name: 'idDoc', maxCount: 1 },
    { name: 'isbnDoc', maxCount: 1 }
]);

module.exports = {
    allowedImageTypes,
    allowedDocumentTypes,
    storage,
    upload,
    dualUploadFields,
    profileUploadFields
};
