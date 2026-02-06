const express = require("express");
const router = express.Router();
const {
  getDashboardStats,
  getAllUsers,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  getAllArticlesAdmin,
  deleteArticle,
  unpublishArticle,
  getCategoriesWithStats,
  updateCategory,
  deleteCategory,
  getAllTagsWithStats,
  updateTag,
  deleteTag,
  getAuditLogs,
  getAnalytics,
} = require("../controllers/adminController");
const { protect, adminOnly } = require("../middleware/auth");

// All routes require admin authentication
router.use(protect);
router.use(adminOnly);

// Dashboard
router.get("/dashboard/stats", getDashboardStats);
router.get("/analytics", getAnalytics);

// User Management
router.get("/users", getAllUsers);
router.patch("/users/:userId/status", updateUserStatus);
router.patch("/users/:userId/role", updateUserRole);
router.delete("/users/:userId", deleteUser);

// Article Management
router.get("/articles", getAllArticlesAdmin);
router.delete("/articles/:articleId", deleteArticle);
router.patch("/articles/:articleId/unpublish", unpublishArticle);

// Category Management
router.get("/categories", getCategoriesWithStats);
router.patch("/categories/:categoryId", updateCategory);
router.delete("/categories/:categoryId", deleteCategory);

// Tag Management
router.get("/tags", getAllTagsWithStats);
router.patch("/tags/:tagId", updateTag);
router.delete("/tags/:tagId", deleteTag);

// Audit Logs
router.get("/audit-logs", getAuditLogs);

module.exports = router;
