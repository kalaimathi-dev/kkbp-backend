const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "LOGIN",
        "LOGOUT",
        "ARTICLE_CREATE",
        "ARTICLE_EDIT",
        "ARTICLE_DELETE",
        "ARTICLE_APPROVE",
        "ARTICLE_REJECT",
        "USER_CREATE",
        "USER_EDIT",
        "USER_DELETE",
        "USER_ACTIVATE",
        "USER_DEACTIVATE",
        "CATEGORY_CREATE",
        "CATEGORY_EDIT",
        "CATEGORY_DELETE",
        "TAG_CREATE",
        "TAG_EDIT",
        "TAG_DELETE",
        "SETTINGS_UPDATE",
      ],
    },
    entity: {
      type: String,
      required: true, // "Article", "User", "Category", "Tag", "System"
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    details: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

// Index for faster queries
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
