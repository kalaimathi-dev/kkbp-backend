const mongoose = require('mongoose');

const articleEmbeddingSchema = new mongoose.Schema({
  article: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    required: true
  },
  embedding: {
    type: [Number],
    required: true
  },
  embeddingModel: {
    type: String,
    default: 'text-embedding-3-small'
  },
  textContent: {
    type: String,
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster lookups
articleEmbeddingSchema.index({ article: 1 }, { unique: true });
articleEmbeddingSchema.index({ lastUpdated: -1 });

module.exports = mongoose.model('ArticleEmbedding', articleEmbeddingSchema);
