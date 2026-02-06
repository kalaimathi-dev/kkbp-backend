const express = require("express");
const router = express.Router();
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

// Public routes (require authentication)
router.get("/", protect, getArticles);
router.get("/stats", protect, adminOnly, getArticleStats);
router.get("/my-articles", protect, getMyArticles);
router.get("/:id", protect, getArticle);

// Create article (employees only)
router.post("/", protect, createArticle);

// Admin only routes
router.patch("/:id/approve", protect, adminOnly, approveArticle);
router.patch("/:id/reject", protect, adminOnly, rejectArticle);

// Delete (author or admin)
router.delete("/:id", protect, deleteArticle);

module.exports = router;
