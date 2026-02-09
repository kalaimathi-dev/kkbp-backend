const express = require('express');
const router = express.Router();
const { 
  searchKnowledgeBase, 
  searchWithRAG,
  getChatbotStats, 
  getChatbotAnalytics,
  indexArticle,
  indexAllArticles,
  getIndexStatus
} = require('../controllers/chatbotController');
const { protect, adminOnly } = require('../middleware/auth');

/**
 * @route   POST /api/chatbot/rag-search
 * @desc    Search knowledge base using RAG (semantic search + AI answer)
 * @access  Private (requires authentication)
 */
router.post('/rag-search', protect, searchWithRAG);

/**
 * @route   POST /api/chatbot/search
 * @desc    Search knowledge base for approved articles (keyword-based fallback)
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

/**
 * @route   POST /api/chatbot/index-article/:articleId
 * @desc    Index a single article for RAG
 * @access  Private (Admin only)
 */
router.post('/index-article/:articleId', protect, adminOnly, indexArticle);

/**
 * @route   POST /api/chatbot/index-all
 * @desc    Index all approved articles for RAG
 * @access  Private (Admin only)
 */
router.post('/index-all', protect, adminOnly, indexAllArticles);

/**
 * @route   GET /api/chatbot/index-status
 * @desc    Get RAG indexing status
 * @access  Private (Admin only)
 */
router.get('/index-status', protect, adminOnly, getIndexStatus);

module.exports = router;
