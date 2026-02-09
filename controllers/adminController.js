const User = require("../models/User");
const Article = require("../models/Article");
const Category = require("../models/Category");
const Tag = require("../models/Tag");
const AuditLog = require("../models/AuditLog");

// Helper function to create audit log
const createAuditLog = async (userId, action, entity, entityId, details, metadata = {}, req = null) => {
  try {
    await AuditLog.create({
      user: userId,
      action,
      entity,
      entityId,
      details,
      metadata,
      ipAddress: req ? req.ip || req.connection.remoteAddress : null,
    });
  } catch (error) {
    console.error("Error creating audit log:", error);
  }
};

// Dashboard Stats
exports.getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalArticles,
      pendingArticles,
      approvedArticles,
      rejectedArticles,
      totalCategories,
      totalTags,
      recentActivity,
    ] = await Promise.all([
      User.countDocuments(),
      Article.countDocuments(),
      Article.countDocuments({ status: "PENDING" }),
      Article.countDocuments({ status: "APPROVED" }),
      Article.countDocuments({ status: "REJECTED" }),
      Category.countDocuments(),
      Tag.countDocuments(),
      AuditLog.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("user", "username email")
        .lean(),
    ]);

    // Get active users (logged in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeUsers = await AuditLog.distinct("user", {
      action: "LOGIN",
      createdAt: { $gte: thirtyDaysAgo },
    });

    res.json({
      users: {
        total: totalUsers,
        active: activeUsers.length,
      },
      articles: {
        total: totalArticles,
        pending: pendingArticles,
        approved: approvedArticles,
        rejected: rejectedArticles,
      },
      categories: totalCategories,
      tags: totalTags,
      recentActivity,
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ message: "Error fetching dashboard stats" });
  }
};

// User Management
exports.getAllUsers = async (req, res) => {
  try {
    const { search, role, status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (role) filter.role = role;
    if (status) filter.isActive = status === "active";

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter),
    ]);

    // Get article counts for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const articleCount = await Article.countDocuments({ author: user._id });
        const lastLogin = await AuditLog.findOne({
          user: user._id,
          action: "LOGIN",
        })
          .sort({ createdAt: -1 })
          .select("createdAt")
          .lean();

        return {
          ...user,
          articleCount,
          lastLogin: lastLogin?.createdAt || null,
        };
      }),
    );

    res.json({
      users: usersWithStats,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Error fetching users" });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Create audit log
    await createAuditLog(
      req.user._id,
      isActive ? "USER_ACTIVATE" : "USER_DEACTIVATE",
      "User",
      userId,
      `${isActive ? "Activated" : "Deactivated"} user: ${user.email}`,
      { email: user.email, username: user.username },
      req,
    );

    res.json(user);
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({ message: "Error updating user status" });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!["ADMIN", "EMPLOYEE"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Create audit log
    await createAuditLog(
      req.user._id,
      "USER_EDIT",
      "User",
      userId,
      `Changed role to ${role} for user: ${user.email}`,
      { email: user.email, username: user.username, newRole: role },
      req,
    );

    res.json(user);
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ message: "Error updating user role" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent deleting yourself
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot delete your own account" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user has articles
    const articleCount = await Article.countDocuments({ author: userId });
    if (articleCount > 0) {
      return res.status(400).json({
        message: `Cannot delete user with ${articleCount} article(s). Please reassign or delete articles first.`,
      });
    }

    await User.findByIdAndDelete(userId);

    // Create audit log
    await createAuditLog(
      req.user._id,
      "USER_DELETE",
      "User",
      userId,
      `Deleted user: ${user.email}`,
      { email: user.email, username: user.username },
      req,
    );

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Error deleting user" });
  }
};

// Article Management
exports.getAllArticlesAdmin = async (req, res) => {
  try {
    const { search, status, category, author, page = 1, limit = 20, sortBy = "newest" } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
      ];
    }
    if (status) filter.status = status.toUpperCase();
    if (category) filter.category = category;
    if (author) filter.author = author;

    const skip = (page - 1) * limit;
    
    let sort = { createdAt: -1 };
    if (sortBy === "oldest") sort = { createdAt: 1 };
    if (sortBy === "popular") sort = { views: -1 };
    if (sortBy === "title") sort = { title: 1 };

    const [articles, total] = await Promise.all([
      Article.find(filter)
        .populate("author", "username email")
        .populate("category", "name")
        .populate("tags", "name")
        .populate("approvedBy", "username email")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Article.countDocuments(filter),
    ]);

    // Format articles to ensure tags and categories are strings, not objects
    const formattedArticles = articles.map(article => ({
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
      tags: (article.tags || []).map(tag => typeof tag === 'string' ? tag : tag.name),
      pdfFile: article.pdfFile,
      pdfOriginalName: article.pdfOriginalName,
      rejectionReason: article.rejectionReason,
      approvedBy: article.approvedBy?.username || null,
      approvedAt: article.approvedAt,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt
    }));

    res.json({
      articles: formattedArticles,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching articles:", error);
    res.status(500).json({ message: "Error fetching articles" });
  }
};

exports.deleteArticle = async (req, res) => {
  try {
    const { articleId } = req.params;

    const article = await Article.findById(articleId);
    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }

    await Article.findByIdAndDelete(articleId);

    // Create audit log
    await createAuditLog(
      req.user._id,
      "ARTICLE_DELETE",
      "Article",
      articleId,
      `Deleted article: ${article.title}`,
      { title: article.title, author: article.author },
      req,
    );

    res.json({ message: "Article deleted successfully" });
  } catch (error) {
    console.error("Error deleting article:", error);
    res.status(500).json({ message: "Error deleting article" });
  }
};

exports.unpublishArticle = async (req, res) => {
  try {
    const { articleId } = req.params;

    const article = await Article.findByIdAndUpdate(
      articleId,
      { status: "DRAFT", approvedBy: null, approvedAt: null },
      { new: true },
    ).populate("author", "username email");

    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }

    // Create audit log
    await createAuditLog(
      req.user._id,
      "ARTICLE_EDIT",
      "Article",
      articleId,
      `Unpublished article: ${article.title}`,
      { title: article.title },
      req,
    );

    res.json(article);
  } catch (error) {
    console.error("Error unpublishing article:", error);
    res.status(500).json({ message: "Error unpublishing article" });
  }
};

// Category Management
exports.updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description } = req.body;

    const category = await Category.findByIdAndUpdate(
      categoryId,
      { name, description },
      { new: true, runValidators: true },
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Create audit log
    await createAuditLog(
      req.user._id,
      "CATEGORY_EDIT",
      "Category",
      categoryId,
      `Updated category: ${category.name}`,
      { name },
      req,
    );

    res.json(category);
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ message: "Error updating category" });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Check if category has articles
    const articleCount = await Article.countDocuments({ category: categoryId });
    if (articleCount > 0) {
      return res.status(400).json({
        message: `Cannot delete category with ${articleCount} article(s). Please reassign articles first.`,
      });
    }

    const category = await Category.findByIdAndDelete(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Create audit log
    await createAuditLog(
      req.user._id,
      "CATEGORY_DELETE",
      "Category",
      categoryId,
      `Deleted category: ${category.name}`,
      { name: category.name },
      req,
    );

    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ message: "Error deleting category" });
  }
};

exports.getCategoriesWithStats = async (req, res) => {
  try {
    const categories = await Category.find().lean();

    const categoriesWithStats = await Promise.all(
      categories.map(async (category) => {
        const articleCount = await Article.countDocuments({ category: category._id });
        return { ...category, articleCount };
      }),
    );

    res.json(categoriesWithStats);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Error fetching categories" });
  }
};

// Tag Management
exports.getAllTagsWithStats = async (req, res) => {
  try {
    const tags = await Tag.find().lean();

    const tagsWithStats = await Promise.all(
      tags.map(async (tag) => {
        const articleCount = await Article.countDocuments({ tags: tag._id });
        return { ...tag, articleCount };
      }),
    );

    res.json(tagsWithStats);
  } catch (error) {
    console.error("Error fetching tags:", error);
    res.status(500).json({ message: "Error fetching tags" });
  }
};

exports.updateTag = async (req, res) => {
  try {
    const { tagId } = req.params;
    const { name } = req.body;

    const tag = await Tag.findByIdAndUpdate(
      tagId,
      { name },
      { new: true, runValidators: true },
    );

    if (!tag) {
      return res.status(404).json({ message: "Tag not found" });
    }

    // Create audit log
    await createAuditLog(
      req.user._id,
      "TAG_EDIT",
      "Tag",
      tagId,
      `Updated tag: ${tag.name}`,
      { name },
      req,
    );

    res.json(tag);
  } catch (error) {
    console.error("Error updating tag:", error);
    res.status(500).json({ message: "Error updating tag" });
  }
};

exports.deleteTag = async (req, res) => {
  try {
    const { tagId } = req.params;

    const tag = await Tag.findById(tagId);
    if (!tag) {
      return res.status(404).json({ message: "Tag not found" });
    }

    // Remove tag from all articles
    await Article.updateMany({ tags: tagId }, { $pull: { tags: tagId } });

    await Tag.findByIdAndDelete(tagId);

    // Create audit log
    await createAuditLog(
      req.user._id,
      "TAG_DELETE",
      "Tag",
      tagId,
      `Deleted tag: ${tag.name}`,
      { name: tag.name },
      req,
    );

    res.json({ message: "Tag deleted successfully" });
  } catch (error) {
    console.error("Error deleting tag:", error);
    res.status(500).json({ message: "Error deleting tag" });
  }
};

// Audit Logs
exports.getAuditLogs = async (req, res) => {
  try {
    const { action, entity, userId, startDate, endDate, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (action) filter.action = action;
    if (entity) filter.entity = entity;
    if (userId) filter.user = userId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate("user", "username email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      logs,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ message: "Error fetching audit logs" });
  }
};

// Analytics
exports.getAnalytics = async (req, res) => {
  try {
    const { period = "30" } = req.query; // days
    const daysAgo = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    // Articles over time
    const articlesOverTime = await Article.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Articles by status
    const articlesByStatus = await Article.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // Articles by category
    const articlesByCategory = await Article.aggregate([
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryData",
        },
      },
      { $unwind: "$categoryData" },
      { $group: { _id: "$categoryData.name", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Top contributors
    const topContributors = await Article.aggregate([
      {
        $group: {
          _id: "$author",
          articleCount: { $sum: 1 },
          totalViews: { $sum: "$views" },
        },
      },
      { $sort: { articleCount: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userData",
        },
      },
      { $unwind: "$userData" },
      {
        $project: {
          _id: 1,
          articleCount: 1,
          totalViews: 1,
          username: "$userData.username",
          email: "$userData.email",
        },
      },
    ]);

    // Activity by action type
    const activityByAction = await AuditLog.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: "$action", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Approval turnaround time (average time from PENDING to APPROVED)
    const approvalTimes = await Article.aggregate([
      {
        $match: {
          status: "APPROVED",
          approvedAt: { $exists: true },
        },
      },
      {
        $project: {
          turnaroundTime: {
            $divide: [{ $subtract: ["$approvedAt", "$createdAt"] }, 3600000],
          }, // in hours
        },
      },
      {
        $group: {
          _id: null,
          avgTurnaround: { $avg: "$turnaroundTime" },
          minTurnaround: { $min: "$turnaroundTime" },
          maxTurnaround: { $max: "$turnaroundTime" },
        },
      },
    ]);

    res.json({
      articlesOverTime,
      articlesByStatus,
      articlesByCategory,
      topContributors,
      activityByAction,
      approvalTurnaround: approvalTimes[0] || {
        avgTurnaround: 0,
        minTurnaround: 0,
        maxTurnaround: 0,
      },
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ message: "Error fetching analytics" });
  }
};

module.exports = exports;
