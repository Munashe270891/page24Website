const mongoose = require('mongoose');

const BookSchema = new mongoose.Schema({
    title: { type: String, required: true },
    author: { type: String, default: "Chengetai" }, // Temporary hardcoded author until we add login
    price: { type: Number, required: true },
    mode: { type: String, enum: ['pdf', 'html'], required: true },
    coverImage: { type: String, required: true }, // URL to the saved cover image
    pdfSource: { type: String }, // URL to the saved PDF file (optional if using HTML mode)
    chapters: [{
        title: String,
        body: String
    }], // Array of chapters if using HTML mode
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Book', BookSchema);
