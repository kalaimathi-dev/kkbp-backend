const OpenAI = require('openai');

/**
 * Embedding Service for RAG Implementation
 * Supports OpenAI, Local (FREE), and can be extended for other providers
 */
class EmbeddingService {
  constructor() {
    this.provider = process.env.EMBEDDING_PROVIDER || 'local';
    this.apiKey = process.env.OPENAI_API_KEY;
    
    if (this.provider === 'openai' && this.apiKey) {
      this.openai = new OpenAI({ apiKey: this.apiKey });
      this.embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    } else if (this.provider === 'local') {
      // Local TF-IDF based embeddings (100% free, no API calls)
      this.embeddingModel = 'local-tfidf-v2';
      this.vectorSize = 256; // Increased size for better distribution
    }
  }

  /**
   * Generate embeddings for text using the configured provider
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} - Vector embedding
   */
  async generateEmbedding(text) {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
      }

      if (this.provider === 'openai') {
        return await this.generateOpenAIEmbedding(text);
      } else if (this.provider === 'local') {
        return this.generateLocalEmbedding(text);
      }
      
      throw new Error(`Unsupported embedding provider: ${this.provider}`);
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generate OpenAI embeddings
   */
  async generateOpenAIEmbedding(text) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: text.substring(0, 8000), // Limit text length
    });

    return response.data[0].embedding;
  }

  /**
   * Generate local embeddings using improved TF-IDF approach (100% FREE - no API, runs locally)
   * This creates a better vector representation of text with stopwords removal and n-grams
   */
  generateLocalEmbedding(text) {
    // First expand abbreviations for better matching
    const expandedText = this.expandAbbreviations(text);
    
    // Common stopwords to filter out
    const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 
      'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what',
      'which', 'who', 'when', 'where', 'why', 'how', 'can', 'all', 'each', 'every', 'some', 'any']);
    
    // Normalize and tokenize text
    const normalized = expandedText
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Extract words and filter stopwords
    const words = normalized.split(' ')
      .filter(w => w.length > 2 && !stopwords.has(w));
    
    // Create bigrams (2-word combinations) for better context
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(words[i] + '_' + words[i + 1]);
    }
    
    // Combine unigrams and bigrams
    const features = [...words, ...bigrams];
    
    // Count word frequencies
    const wordFreq = {};
    features.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });
    
    // Create a fixed-size vector using multiple hash functions for better distribution
    const vector = new Array(this.vectorSize).fill(0);
    
    Object.entries(wordFreq).forEach(([word, freq]) => {
      // Use multiple hash positions for each word to reduce collisions
      const hash1 = this.hashString(word);
      const hash2 = this.hashString(word + '_alt');
      const hash3 = this.hashString(word + '_alt2');
      
      const idx1 = Math.abs(hash1) % this.vectorSize;
      const idx2 = Math.abs(hash2) % this.vectorSize;
      const idx3 = Math.abs(hash3) % this.vectorSize;
      
      // Weight by term frequency with smoothing
      const weight = Math.log(1 + freq);
      
      vector[idx1] += weight;
      vector[idx2] += weight * 0.5;
      vector[idx3] += weight * 0.25;
    });
    
    // Normalize the vector (L2 normalization)
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }
    
    return vector;
  }

  /**
   * Simple hash function for strings
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param {number[]} vecA - First vector
   * @param {number[]} vecB - Second vector
   * @returns {number} - Similarity score (0-1)
   */
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find most similar documents based on embedding similarity
   * @param {number[]} queryEmbedding - Query vector
   * @param {Array} documents - Array of documents with embeddings
   * @param {number} topK - Number of results to return
   * @returns {Array} - Sorted array of similar documents
   */
  findSimilarDocuments(queryEmbedding, documents, topK = 5) {
    const results = documents.map(doc => ({
      ...doc,
      similarity: this.cosineSimilarity(queryEmbedding, doc.embedding)
    }));

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Hybrid search: Combines semantic similarity with keyword matching
   * @param {string} query - User query text
   * @param {number[]} queryEmbedding - Query vector  
   * @param {Array} documents - Array of documents with embeddings
   * @param {number} topK - Number of results to return
   * @returns {Array} - Sorted array of similar documents with hybrid scores
   */
  findSimilarDocumentsHybrid(query, queryEmbedding, documents, topK = 5) {
    // Extract keywords from query
    const queryKeywords = this.extractKeywords(query);
    
    const results = documents.map(doc => {
      // Calculate semantic similarity
      const semanticScore = this.cosineSimilarity(queryEmbedding, doc.embedding);
      
      // Calculate keyword overlap with title (most important)
      const titleText = doc.article.title.toLowerCase();
      const contentText = (doc.article.content + ' ' + (doc.article.excerpt || '')).toLowerCase();
      
      let keywordScore = 0;
      let titleMatches = 0;
      let contentMatches = 0;
      
      queryKeywords.forEach(keyword => {
        if (titleText.includes(keyword)) {
          titleMatches++;
          keywordScore += 0.5; // High weight for title matches
        }
        if (contentText.includes(keyword)) {
          contentMatches++;
          keywordScore += 0.1; // Lower weight for content matches
        }
      });
      
      // Normalize keyword score
      if (queryKeywords.length > 0) {
        keywordScore = keywordScore / queryKeywords.length;
      }
      
      // Hybrid score: 60% semantic + 40% keyword matching
      const hybridScore = (semanticScore * 0.6) + (keywordScore * 0.4);
      
      return {
        ...doc,
        similarity: hybridScore,
        semanticScore,
        keywordScore,
        titleMatches,
        contentMatches
      };
    });

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Expand common abbreviations and shortforms to their full terms
   * Example: "db" -> "database", "api" -> "application programming interface"
   */
  expandAbbreviations(text) {
    const abbreviations = {
      // Database & Storage
      'db': 'database',
      'sql': 'structured query language sql',
      'nosql': 'nosql database',
      'rdbms': 'relational database management system',
      
      // Programming & Frameworks
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'npm': 'node package manager npm',
      'jsx': 'javascript jsx react',
      'tsx': 'typescript tsx react',
      
      // Web Technologies
      'api': 'application programming interface api',
      'rest': 'representational state transfer rest api',
      'http': 'hypertext transfer protocol http',
      'https': 'hypertext transfer protocol secure https',
      'url': 'uniform resource locator url',
      'uri': 'uniform resource identifier uri',
      'dns': 'domain name system dns',
      'ssl': 'secure sockets layer ssl',
      'tls': 'transport layer security tls',
      
      // Data Formats
      'json': 'javascript object notation json',
      'xml': 'extensible markup language xml',
      'html': 'hypertext markup language html',
      'css': 'cascading style sheets css',
      'yaml': 'yaml data format',
      
      // Operations
      'crud': 'create read update delete crud',
      'ci': 'continuous integration',
      'cd': 'continuous deployment',
      'cicd': 'continuous integration continuous deployment',
      
      // Interfaces & Systems
      'ui': 'user interface',
      'ux': 'user experience',
      'cli': 'command line interface',
      'gui': 'graphical user interface',
      'ide': 'integrated development environment',
      'sdk': 'software development kit',
      'os': 'operating system',
      
      // Network & Infrastructure
      'ip': 'internet protocol ip address',
      'tcp': 'transmission control protocol tcp',
      'udp': 'user datagram protocol udp',
      'ftp': 'file transfer protocol',
      'ssh': 'secure shell ssh',
      'vpn': 'virtual private network',
      'cdn': 'content delivery network',
      'aws': 'amazon web services aws cloud',
      
      // Server & Backend
      'nginx': 'nginx web server',
      'apache': 'apache web server',
      'node': 'nodejs node',
      'nodejs': 'nodejs node server',
      'express': 'expressjs express server',
      
      // Errors & Issues
      'err': 'error',
      'auth': 'authentication authorization',
      'cors': 'cross origin resource sharing cors',
      
      // Other Common Terms
      'env': 'environment',
      'config': 'configuration',
      'admin': 'administrator administration',
      'app': 'application',
      'repo': 'repository',
      'docs': 'documentation',
      'pkg': 'package',
      'lib': 'library',
      'deps': 'dependencies',
      'prod': 'production',
      'dev': 'development',
    };
    
    let expandedText = text.toLowerCase();
    
    // Replace each abbreviation with its expanded form
    // Use word boundaries to avoid partial matches
    for (const [abbr, expansion] of Object.entries(abbreviations)) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      expandedText = expandedText.replace(regex, expansion);
    }
    
    return expandedText;
  }

  /**
   * Extract important keywords from text
   */
  extractKeywords(text) {
    // First expand abbreviations
    const expandedText = this.expandAbbreviations(text);
    
    const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 
      'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what',
      'which', 'who', 'when', 'where', 'why', 'how', 'can', 'all', 'each', 'every', 'some', 'any',
      'get', 'fix', 'issue', 'error', 'problem']);
    
    const words = expandedText
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w));
    
    return [...new Set(words)]; // Return unique keywords
  }

  /**
   * Generate answer using LLM with retrieved context
   * @param {string} query - User question
   * @param {Array} relevantDocs - Retrieved documents
   * @returns {Promise<string>} - Generated answer
   */
  async generateAnswer(query, relevantDocs) {
    try {
      // For free/local tier, return a formatted answer based on retrieved docs
      if (this.provider === 'local' || !this.openai) {
        return this.generateRuleBasedAnswer(query, relevantDocs);
      }

      // Build context from relevant documents
      const context = relevantDocs
        .map((doc, idx) => `
Document ${idx + 1} - ${doc.title}:
${doc.content}
${doc.excerpt ? `Summary: ${doc.excerpt}` : ''}
---`)
        .join('\n\n');

      const systemPrompt = `You are a helpful knowledge base assistant for Kambaa Knowledge Base Portal. 
Your role is to answer questions based ONLY on the provided documents.

Guidelines:
- Provide accurate, helpful answers based on the context
- If the information isn't in the documents, say "I don't have enough information about that"
- Cite which document(s) you're referencing
- Be concise but comprehensive
- Use a friendly, professional tone`;

      const userPrompt = `Based on the following documents, please answer this question:

Question: ${query}

Context:
${context}

Answer:`;

      const response = await this.openai.chat.completions.create({
        model: process.env.LLM_MODEL || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating answer:', error);
      throw error;
    }
  }

  /**
   * Generate rule-based answer (FREE - no LLM required)
   * Used when LLM is not available
   */
  generateRuleBasedAnswer(query, relevantDocs) {
    if (!relevantDocs || relevantDocs.length === 0) {
      return "I couldn't find relevant information to answer your question.";
    }

    const topDoc = relevantDocs[0];
    let answer = `Based on the article "${topDoc.title}":\n\n`;
    
    // Extract excerpt or first part of content
    if (topDoc.excerpt) {
      answer += topDoc.excerpt + '\n\n';
    } else {
      // Get first 300 characters of content
      const contentPreview = topDoc.content.substring(0, 300).trim();
      answer += contentPreview + '...\n\n';
    }
    
    answer += `📚 Please refer to the full article for complete details and step-by-step instructions.`;
    
    if (relevantDocs.length > 1) {
      answer += `\n\n💡 Also check out these related articles:\n`;
      relevantDocs.slice(1, 3).forEach((doc, idx) => {
        answer += `${idx + 2}. ${doc.title}\n`;
      });
    }
    
    return answer;
  }

  /**
   * Check if service is configured and ready
   */
  isConfigured() {
    if (this.provider === 'openai') {
      return !!(this.apiKey);
    } else if (this.provider === 'local') {
      return true; // Local always works
    }
    return false;
  }
}

module.exports = new EmbeddingService();
