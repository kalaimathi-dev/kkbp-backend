const { Article, User, Category, Tag } = require("../models");
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

// @desc    Get all articles with filters
// @route   GET /api/articles
// @access  Private
exports.getArticles = async (req, res) => {
  try {
    const { status, category, search, limit } = req.query;

    // Build query
    const query = {};

    if (status) {
      query.status = status.toUpperCase();
    } else {
      // Default: only show approved articles to non-admins
      if (req.user.role !== "ADMIN") {
        query.status = "APPROVED";
      }
    }

    if (category) {
      const categoryRecord = await Category.findOne({ name: category });
      if (categoryRecord) {
        query.category = categoryRecord._id;
      }
    }

    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [{ title: regex }, { content: regex }];
    }

    // Query articles
    const queryBuilder = Article.find(query)
      .populate("author", "username email")
      .populate("category", "name")
      .populate("tags", "name")
      .sort({ createdAt: -1 });

    if (limit) {
      queryBuilder.limit(parseInt(limit));
    }

    const articles = await queryBuilder.exec();

    // Format response
    const formattedArticles = articles.map((article) => ({
      id: article._id,
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      status: article.status,
      views: article.views,
      bookmarks: article.bookmarks,
      author: article.author?.username,
      authorEmail: article.author?.email,
      category: article.category?.name || null,
      tags: (article.tags || []).map((tag) => tag.name),
      pdfFile: article.pdfFile,
      pdfOriginalName: article.pdfOriginalName,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    }));

    res.json(formattedArticles);
  } catch (error) {
    console.error("Get articles error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get single article
// @route   GET /api/articles/:id
// @access  Private
exports.getArticle = async (req, res) => {
  try {
    const article = await Article.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true },
    )
      .populate("author", "username email")
      .populate("category", "name")
      .populate("tags", "name");

    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }

    const formattedArticle = {
      id: article._id,
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      status: article.status,
      views: article.views,
      bookmarks: article.bookmarks,
      author: article.author?.username,
      authorEmail: article.author?.email,
      category: article.category?.name || null,
      tags: (article.tags || []).map((tag) => tag.name),
      rejectionReason: article.rejectionReason,
      pdfFile: article.pdfFile,
      pdfOriginalName: article.pdfOriginalName,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    };

    res.json(formattedArticle);
  } catch (error) {
    console.error("Get article error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Create new article
// @route   POST /api/articles
// @access  Private (Employee only)
exports.createArticle = async (req, res) => {
  try {
    const { title, content, excerpt, category, tags, status } = req.body;

    // Validation
    if (!title || !content) {
      return res
        .status(400)
        .json({ message: "Title and content are required" });
    }

    // Admins cannot create articles
    if (req.user.role === "ADMIN") {
      return res.status(403).json({
        message:
          "Admins cannot create articles. Only employees can submit articles.",
      });
    }

    // Find or create category
    let categoryId = null;
    if (category) {
      const categoryRecord = await Category.findOneAndUpdate(
        { name: category },
        { $setOnInsert: { name: category } },
        { new: true, upsert: true },
      );
      categoryId = categoryRecord._id;
    }

    // Handle PDF file if uploaded
    let pdfFileName = null;
    let pdfOriginalName = null;
    let pdfText = '';
    
    if (req.file) {
      pdfFileName = req.file.filename;
      pdfOriginalName = req.file.originalname;
      
      // Extract text from PDF for RAG indexing
      try {
        const pdfBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdf(pdfBuffer);
        pdfText = pdfData.text || '';
        console.log(`Extracted ${pdfText.length} characters from PDF: ${pdfOriginalName}`);
      } catch (pdfError) {
        console.error('Error extracting PDF text:', pdfError);
        // Continue without PDF text extraction
      }
    }

    // Create article (keep content clean - PDF text stored separately)
    const article = await Article.create({
      title,
      content: content,  // User's content only
      excerpt,
      status: status || "PENDING",
      author: req.user.id,
      category: categoryId,
      pdfFile: pdfFileName,
      pdfOriginalName: pdfOriginalName,
      pdfText: pdfText || null,  // Store PDF text separately for RAG
    });

    // Handle tags - parse JSON string if needed (from FormData)
    let tagsArray = tags;
    if (typeof tags === 'string') {
      try {
        tagsArray = JSON.parse(tags);
      } catch (e) {
        // If not JSON, split by comma
        tagsArray = tags.split(',').map(t => t.trim()).filter(t => t);
      }
    }
    
    if (tagsArray && tagsArray.length > 0) {
      const tagDocs = await Promise.all(
        tagsArray
          .filter(Boolean)
          .map((tagName) => tagName.toString().trim())
          .filter((tagName) => tagName.length > 0)
          .map((tagName) =>
            Tag.findOneAndUpdate(
              { name: tagName },
              { $setOnInsert: { name: tagName } },
              { new: true, upsert: true },
            ),
          ),
      );
      article.tags = tagDocs.map((t) => t._id);
      await article.save();
    }

    // Fetch complete article with associations
    const createdArticle = await Article.findById(article._id)
      .populate("author", "username email")
      .populate("category", "name")
      .populate("tags", "name");

    res.status(201).json({
      id: createdArticle._id,
      title: createdArticle.title,
      content: createdArticle.content,
      excerpt: createdArticle.excerpt,
      status: createdArticle.status,
      author: createdArticle.author?.username,
      category: createdArticle.category?.name || null,
      tags: (createdArticle.tags || []).map((tag) => tag.name),
      createdAt: createdArticle.createdAt,
    });
  } catch (error) {
    console.error("Create article error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get user's articles
// @route   GET /api/articles/my-articles
// @access  Private
exports.getMyArticles = async (req, res) => {
  try {
    const articles = await Article.find({ author: req.user.id })
      .populate("category", "name")
      .populate("tags", "name")
      .sort({ createdAt: -1 });

    const formattedArticles = articles.map((article) => ({
      id: article._id,
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      status: article.status,
      category: article.category?.name || null,
      tags: (article.tags || []).map((tag) => tag.name),
      rejectionReason: article.rejectionReason,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    }));

    res.json(formattedArticles);
  } catch (error) {
    console.error("Get my articles error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Approve article
// @route   PATCH /api/articles/:id/approve
// @access  Private (Admin only)
exports.approveArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }

    article.status = "APPROVED";
    article.approvedBy = req.user.id;
    article.approvedAt = new Date();
    article.rejectionReason = null;

    await article.save();

    res.json({ message: "Article approved successfully", article });
  } catch (error) {
    console.error("Approve article error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Reject article
// @route   PATCH /api/articles/:id/reject
// @access  Private (Admin only)
exports.rejectArticle = async (req, res) => {
  try {
    const { reason } = req.body;
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }

    article.status = "REJECTED";
    article.rejectionReason = reason || "No reason provided";
    await article.save();

    res.json({ message: "Article rejected", article });
  } catch (error) {
    console.error("Reject article error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Delete article
// @route   DELETE /api/articles/:id
// @access  Private (Author or Admin)
exports.deleteArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }

    // Check ownership or admin
    if (
      article.author?.toString() !== req.user.id?.toString() &&
      req.user.role !== "ADMIN"
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this article" });
    }

    await article.deleteOne();

    res.json({ message: "Article deleted successfully" });
  } catch (error) {
    console.error("Delete article error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get article stats for admin dashboard
// @route   GET /api/articles/stats
// @access  Private (Admin only)
exports.getArticleStats = async (req, res) => {
  try {
    const total = await Article.countDocuments();
    const pending = await Article.countDocuments({ status: "PENDING" });
    const approved = await Article.countDocuments({ status: "APPROVED" });
    const rejected = await Article.countDocuments({ status: "REJECTED" });

    res.json({ total, pending, approved, rejected });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
