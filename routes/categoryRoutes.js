const express = require("express");
const router = express.Router();
const {
  getCategories,
  createCategory,
} = require("../controllers/categoryController");
const { protect, adminOnly } = require("../middleware/auth");

router.get("/", protect, getCategories);
router.post("/", protect, adminOnly, createCategory);

module.exports = router;
