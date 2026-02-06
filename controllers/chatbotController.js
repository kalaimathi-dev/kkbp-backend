const { Article, Category, Tag } = require('../models');

/**
 * Search for relevant approved articles based on user query
 * @route POST /api/chatbot/search
 */
exports.searchKnowledgeBase = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ 
        message: 'Please provide a search query' 
      });
    }

    const searchTerm = query.trim();
    
    // Split search term into keywords (remove common words)
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were'];
    const keywords = searchTerm
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.includes(word));

    // Build search conditions with keyword matching
    const searchConditions = {
      status: 'APPROVED',
      $or: [
        // Full phrase search
        { title: { $regex: searchTerm, $options: 'i' } },
        { content: { $regex: searchTerm, $options: 'i' } },
        { excerpt: { $regex: searchTerm, $options: 'i' } },
        // Individual keyword searches
        ...keywords.flatMap(keyword => [
          { title: { $regex: keyword, $options: 'i' } },
          { content: { $regex: keyword, $options: 'i' } },
          { excerpt: { $regex: keyword, $options: 'i' } }
        ])
      ]
    };

    // Find articles and populate category, tags, and author
    const articles = await Article.find(searchConditions)
      .populate('category', 'name')
      .populate('tags', 'name')
      .populate('author', 'username email')
      .sort({ approvedAt: -1 })
      .limit(10);

    if (articles.length === 0) {
      return res.json({
        found: false,
        message: '❌ No approved knowledge article found for this issue.\nTry using different keywords or submit this solution to KKBP once resolved.'
      });
    }

    // Score articles based on relevance
    const scoredArticles = articles.map(article => {
      let score = 0;
      const titleLower = article.title.toLowerCase();
      const excerptLower = (article.excerpt || '').toLowerCase();
      const contentLower = article.content.toLowerCase();
      const queryLower = searchTerm.toLowerCase();

      // Exact phrase match gets highest score
      if (titleLower.includes(queryLower)) score += 100;
      if (excerptLower.includes(queryLower)) score += 80;
      if (contentLower.includes(queryLower)) score += 50;

      // Individual keyword matches
      keywords.forEach(keyword => {
        if (titleLower.includes(keyword)) score += 10;
        if (excerptLower.includes(keyword)) score += 5;
        if (contentLower.includes(keyword)) score += 2;
        if (article.tags && article.tags.some(tag => tag.name.toLowerCase().includes(keyword))) score += 8;
        if (article.category && article.category.name.toLowerCase().includes(keyword)) score += 5;
      });

      // Bonus for multiple keyword matches
      const matchedKeywords = keywords.filter(keyword => 
        titleLower.includes(keyword) || excerptLower.includes(keyword) || contentLower.includes(keyword)
      );
      score += matchedKeywords.length * 5;

      return { article, score };
    });

    // Sort by score and get the best match
    scoredArticles.sort((a, b) => b.score - a.score);
    const bestMatch = scoredArticles[0].article;

    // Format response
    const response = {
      found: true,
      article: {
        id: bestMatch._id,
        title: bestMatch.title,
        category: bestMatch.category?.name || 'Uncategorized',
        excerpt: bestMatch.excerpt || '',
        content: bestMatch.content,
        tags: bestMatch.tags ? bestMatch.tags.map(tag => tag.name) : [],
        approvedAt: bestMatch.approvedAt,
        views: bestMatch.views || 0,
        author: bestMatch.author?.username || 'Unknown'
      },
      alternativeResults: scoredArticles.slice(1, 4).map(item => ({
        id: item.article._id,
        title: item.article.title,
        category: item.article.category?.name || 'Uncategorized'
      }))
    };

    res.json(response);

  } catch (error) {
    console.error('Chatbot search error:', error);
    res.status(500).json({ 
      message: 'Error searching knowledge base',
      error: error.message 
    });
  }
};

/**
 * Get chatbot statistics
 * @route GET /api/chatbot/stats
 */
exports.getChatbotStats = async (req, res) => {
  try {
    const totalApproved = await Article.countDocuments({ status: 'APPROVED' });
    const categories = await Article.aggregate([
      { $match: { status: 'APPROVED' } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    res.json({
      totalApprovedArticles: totalApproved,
      categoriesAvailable: categories.length,
      status: 'operational'
    });
  } catch (error) {
    console.error('Chatbot stats error:', error);
    res.status(500).json({ 
      message: 'Error fetching chatbot stats',
      error: error.message 
    });
  }
};

/**
 * Get chatbot analytics for admin (ADMIN ONLY)
 * @route GET /api/chatbot/analytics
 */
exports.getChatbotAnalytics = async (req, res) => {
  try {
    // Get total articles by status
    const articleStats = await Article.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get top viewed articles (from approved articles)
    const topArticles = await Article.find({ status: 'APPROVED' })
      .populate('category', 'name')
      .populate('author', 'username')
      .sort({ views: -1 })
      .limit(10)
      .select('title views category author createdAt');

    // Get articles by category
    const articlesByCategory = await Article.aggregate([
      { $match: { status: 'APPROVED' } },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      {
        $group: {
          _id: '$categoryInfo.name',
          count: { $sum: 1 },
          totalViews: { $sum: '$views' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Calculate average views
    const avgViewsResult = await Article.aggregate([
      { $match: { status: 'APPROVED' } },
      {
        $group: {
          _id: null,
          avgViews: { $avg: '$views' },
          totalViews: { $sum: '$views' }
        }
      }
    ]);

    const avgViews = avgViewsResult.length > 0 ? avgViewsResult[0].avgViews : 0;
    const totalViews = avgViewsResult.length > 0 ? avgViewsResult[0].totalViews : 0;

    // Get recent approved articles
    const recentArticles = await Article.find({ status: 'APPROVED' })
      .populate('category', 'name')
      .populate('author', 'username')
      .sort({ approvedAt: -1 })
      .limit(5)
      .select('title approvedAt category views');

    res.json({
      articleStats,
      topArticles,
      articlesByCategory,
      avgViews: Math.round(avgViews),
      totalViews,
      recentArticles,
      totalApproved: await Article.countDocuments({ status: 'APPROVED' })
    });
  } catch (error) {
    console.error('Chatbot analytics error:', error);
    res.status(500).json({ 
      message: 'Error fetching chatbot analytics',
      error: error.message 
    });
  }
};
