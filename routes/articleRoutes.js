const express = require("express");
const router = express.Router();
const path = require("path");
const {
  getArticles,
  getArticle,
  createArticle,
  getMyArticles,
  approveArticle,
  rejectArticle,
  deleteArticle,
  getArticleStats,
} = require("../controllers/articleController");
const { protect, adminOnly } = require("../middleware/auth");
const upload = require("../middleware/upload");

// Public routes (require authentication)
router.get("/", protect, getArticles);
router.get("/stats", protect, adminOnly, getArticleStats);
router.get("/my-articles", protect, getMyArticles);
router.get("/:id", protect, getArticle);

// Create article (employees only) - with optional PDF upload
router.post("/", protect, upload.single('pdfFile'), createArticle);

// Serve PDF files - Public route for iframe viewing
router.get("/pdf/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../uploads/pdfs', filename);
    
    // Check if file exists and article is approved (security check)
    const Article = require('../models/Article');
    const article = await Article.findOne({ pdfFile: filename, status: 'APPROVED' });
    
    if (!article) {
      return res.status(404).json({ message: 'PDF not found or article not approved' });
    }
    
    // Serve the PDF file
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Error sending PDF:', err);
        res.status(404).json({ message: 'PDF file not found' });
      }
    });
  } catch (error) {
    console.error('Error serving PDF:', error);
    res.status(500).json({ message: 'Error serving PDF' });
  }
});

// Admin only routes
router.patch("/:id/approve", protect, adminOnly, approveArticle);
router.patch("/:id/reject", protect, adminOnly, rejectArticle);

// Delete (author or admin)
router.delete("/:id", protect, deleteArticle);

module.exports = router;
