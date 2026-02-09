const { Article, Category, Tag, ArticleEmbedding } = require('../models');
const embeddingService = require('../services/embeddingService');

/**
 * Search using RAG (Retrieval-Augmented Generation)
 * @route POST /api/chatbot/rag-search
 */
exports.searchWithRAG = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ 
        message: 'Please provide a search query' 
      });
    }

    // Check if embedding service is configured
    if (!embeddingService.isConfigured()) {
      return res.status(503).json({
        message: 'RAG service is not configured. Please set OPENAI_API_KEY in environment variables.',
        fallbackAvailable: true
      });
    }

    // Generate embedding for the query
    const queryEmbedding = await embeddingService.generateEmbedding(query);

    // Get all article embeddings
    const articleEmbeddings = await ArticleEmbedding.find({})
      .populate({
        path: 'article',
        match: { status: 'APPROVED' },
        populate: [
          { path: 'category', select: 'name' },
          { path: 'tags', select: 'name' },
          { path: 'author', select: 'username email' }
        ]
      });

    // Filter out articles that don't exist or aren't approved
    const validEmbeddings = articleEmbeddings.filter(emb => emb.article);

    if (validEmbeddings.length === 0) {
      return res.json({
        found: false,
        message: '❌ No indexed articles found. Please index articles first.',
        needsIndexing: true
      });
    }

    // Find similar documents using HYBRID search (semantic + keyword matching)
    const similarDocs = embeddingService.findSimilarDocumentsHybrid(
      query,
      queryEmbedding,
      validEmbeddings.map(emb => ({
        ...emb.toObject(),
        article: emb.article.toObject()
      })),
      5
    );

    // Adjust similarity threshold based on embedding provider
    const embeddingProvider = process.env.EMBEDDING_PROVIDER || 'local';
    // Lower threshold for local/gemini embeddings since they use hybrid scoring
    const minSimilarity = (embeddingProvider === 'local' || embeddingProvider === 'gemini') ? 0.05 : 0.5;

    console.log(`🔍 Search: "${query}"`);
    console.log(`📊 Top results:`, similarDocs.slice(0, 3).map(d => ({
      title: d.article.title.substring(0, 50),
      similarity: (d.similarity * 100).toFixed(1) + '%'
    })));

    if (similarDocs.length === 0 || similarDocs[0].similarity < minSimilarity) {
      return res.json({
        found: false,
        message: '❌ No relevant articles found for your query. Try rephrasing or submit this solution to KKBP once resolved.'
      });
    }

    // Generate AI answer using the retrieved documents
    const relevantArticles = similarDocs.slice(0,3).map(doc => ({
      title: doc.article.title,
      content: doc.article.content,
      excerpt: doc.article.excerpt
    }));

    const aiAnswer = await embeddingService.generateAnswer(query, relevantArticles);

    // Format response
    const response = {
      found: true,
      ragEnabled: true,
      aiAnswer,
      sources: similarDocs.slice(0, 3).map((doc, idx) => ({
        id: doc.article._id,
        title: doc.article.title,
        category: doc.article.category?.name || 'Uncategorized',
        excerpt: doc.article.excerpt || '',
        similarity: (doc.similarity * 100).toFixed(1) + '%',
        tags: doc.article.tags ? doc.article.tags.map(tag => tag.name) : [],
        views: doc.article.views || 0,
        author: doc.article.author?.username || 'Unknown',
        pdfFile: doc.article.pdfFile || null,
        pdfOriginalName: doc.article.pdfOriginalName || null
      })),
      alternativeResults: similarDocs.slice(3, 5).map(doc => ({
        id: doc.article._id,
        title: doc.article.title,
        category: doc.article.category?.name || 'Uncategorized',
        similarity: (doc.similarity * 100).toFixed(1) + '%'
      }))
    };

    res.json(response);

  } catch (error) {
    console.error('RAG search error:', error);
    res.status(500).json({ 
      message: 'Error performing RAG search',
      error: error.message 
    });
  }
};

/**
 * Search for relevant approved articles based on user query (Keyword-based fallback)
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

/**
 * Index a single article for RAG
 * @route POST /api/chatbot/index-article/:articleId
 */
exports.indexArticle = async (req, res) => {
  try {
    const { articleId } = req.params;

    // Check if embedding service is configured
    if (!embeddingService.isConfigured()) {
      return res.status(503).json({
        message: 'Embedding service is not configured. Please set OPENAI_API_KEY.'
      });
    }

    // Get the article
    const article = await Article.findById(articleId);
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }

    if (article.status !== 'APPROVED') {
      return res.status(400).json({ 
        message: 'Only approved articles can be indexed' 
      });
    }

    // Prepare text for embedding (combine title, excerpt, content, and PDF text)
    let textToEmbed = `${article.title}\n\n${article.excerpt || ''}\n\n${article.content}`;
    if (article.pdfText) {
      textToEmbed += `\n\n--- PDF Content ---\n${article.pdfText}`;
    }

    // Generate embedding
    const embedding = await embeddingService.generateEmbedding(textToEmbed);

    // Save or update embedding
    await ArticleEmbedding.findOneAndUpdate(
      { article: articleId },
      {
        article: articleId,
        embedding,
        textContent: textToEmbed,
        embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Article indexed successfully',
      articleId,
      title: article.title
    });

  } catch (error) {
    console.error('Error indexing article:', error);
    res.status(500).json({ 
      message: 'Error indexing article',
      error: error.message 
    });
  }
};

/**
 * Index all approved articles for RAG
 * @route POST /api/chatbot/index-all
 */
exports.indexAllArticles = async (req, res) => {
  try {
    // Check if embedding service is configured
    if (!embeddingService.isConfigured()) {
      return res.status(503).json({
        message: 'Embedding service is not configured. Please set OPENAI_API_KEY.'
      });
    }

    // Get all approved articles
    const articles = await Article.find({ status: 'APPROVED' });

    if (articles.length === 0) {
      return res.json({
        success: true,
        message: 'No approved articles to index',
        indexed: 0
      });
    }

    let indexed = 0;
    let failed = 0;
    const errors = [];

    // Index each article
    for (const article of articles) {
      try {
        let textToEmbed = `${article.title}\n\n${article.excerpt || ''}\n\n${article.content}`;
        if (article.pdfText) {
          textToEmbed += `\n\n--- PDF Content ---\n${article.pdfText}`;
        }
        const embedding = await embeddingService.generateEmbedding(textToEmbed);

        await ArticleEmbedding.findOneAndUpdate(
          { article: article._id },
          {
            article: article._id,
            embedding,
            textContent: textToEmbed,
            embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
            lastUpdated: new Date()
          },
          { upsert: true, new: true }
        );

        indexed++;
      } catch (error) {
        failed++;
        errors.push({
          articleId: article._id,
          title: article.title,
          error: error.message
        });
        console.error(`Error indexing article ${article._id}:`, error);
      }
    }

    res.json({
      success: true,
      message: `Indexed ${indexed} articles`,
      indexed,
      failed,
      total: articles.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error indexing all articles:', error);
    res.status(500).json({ 
      message: 'Error indexing articles',
      error: error.message 
    });
  }
};

/**
 * Get indexing status
 * @route GET /api/chatbot/index-status
 */
exports.getIndexStatus = async (req, res) => {
  try {
    const totalApproved = await Article.countDocuments({ status: 'APPROVED' });
    const totalIndexed = await ArticleEmbedding.countDocuments();
    
    const indexed = await ArticleEmbedding.find()
      .populate('article', 'title status')
      .sort({ lastUpdated: -1 })
      .limit(10);

    const recentlyUpdated = indexed.filter(e => e.article).map(e => ({
      articleId: e.article._id,
      title: e.article.title,
      lastUpdated: e.lastUpdated,
      model: e.embeddingModel
    }));

    res.json({
      configured: embeddingService.isConfigured(),
      totalApproved,
      totalIndexed,
      needsIndexing: totalApproved - totalIndexed,
      recentlyUpdated
    });

  } catch (error) {
    console.error('Error getting index status:', error);
    res.status(500).json({ 
      message: 'Error getting index status',
      error: error.message 
    });
  }
};
