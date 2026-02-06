const express = require('express');
const router = express.Router();
const { searchKnowledgeBase, getChatbotStats, getChatbotAnalytics } = require('../controllers/chatbotController');
const { protect } = require('../middleware/auth');

/**
 * @route   POST /api/chatbot/search
 * @desc    Search knowledge base for approved articles
 * @access  Private (requires authentication)
 */
router.post('/search', protect, searchKnowledgeBase);

/**
 * @route   GET /api/chatbot/stats
 * @desc    Get chatbot statistics
 * @access  Private (requires authentication)
 */
router.get('/stats', protect, getChatbotStats);

/**
 * @route   GET /api/chatbot/analytics
 * @desc    Get detailed chatbot analytics for admin
 * @access  Private (Admin only)
 */
router.get('/analytics', protect, getChatbotAnalytics);

module.exports = router;
