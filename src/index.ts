#!/usr/bin/env node

import { SACLMCPServer } from './mcp/SACLMCPServer.js';
import { SACLConfig } from './types/index.js';
import { GraphitiConfig } from './graphiti/GraphitiClient.js';

/**
 * SACL MCP Server Entry Point
 * Implements Semantic-Augmented Reranking and Localization for code retrieval
 */

async function main() {
  try {
    console.log('🚀 Starting SACL MCP Server...');
    console.log('Semantic-Augmented Code Retrieval for AI Agents');
    console.log('');

    // Get configuration from environment variables
    const saclConfig: SACLConfig = {
      llmModel: process.env.SACL_LLM_MODEL || 'gpt-4',
      embeddingModel: process.env.SACL_EMBEDDING_MODEL || 'text-embedding-3-small',
      biasThreshold: parseFloat(process.env.SACL_BIAS_THRESHOLD || '0.5'),
      maxResults: parseInt(process.env.SACL_MAX_RESULTS || '10'),
      cacheEnabled: process.env.SACL_CACHE_ENABLED !== 'false'
    };

    const graphitiConfig: GraphitiConfig = {
      neo4jUri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4jUser: process.env.NEO4J_USER || 'neo4j',
      neo4jPassword: process.env.NEO4J_PASSWORD || '',
      openaiApiKey: process.env.OPENAI_API_KEY || ''
    };

    // Validate required configuration
    if (!graphitiConfig.openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    if (!graphitiConfig.neo4jPassword) {
      throw new Error('NEO4J_PASSWORD environment variable is required');
    }

    console.log('📋 Configuration:');
    console.log(`  LLM Model: ${saclConfig.llmModel}`);
    console.log(`  Embedding Model: ${saclConfig.embeddingModel}`);
    console.log(`  Bias Threshold: ${saclConfig.biasThreshold}`);
    console.log(`  Max Results: ${saclConfig.maxResults}`);
    console.log(`  Cache Enabled: ${saclConfig.cacheEnabled}`);
    console.log(`  Neo4j URI: ${graphitiConfig.neo4jUri}`);
    console.log('');

    // Initialize and start SACL MCP Server
    const server = new SACLMCPServer();
    
    await server.initialize(saclConfig, graphitiConfig);
    await server.start();

    console.log('✅ SACL MCP Server is running and ready for connections');
    console.log('');
    console.log('Available MCP Tools:');
    console.log('  • analyze_repository - Full SACL analysis of codebase');
    console.log('  • query_code - Bias-aware code search');
    console.log('  • get_bias_analysis - Detailed bias metrics');
    console.log('  • get_system_stats - System performance stats');
    console.log('');
    console.log('Waiting for MCP client connections...');

  } catch (error) {
    console.error('❌ Failed to start SACL MCP Server:', error);
    process.exit(1);
  }
}

/**
 * Generate unique namespace from repository path
 */
function generateNamespace(): string {
  const path = process.cwd();
  const repoName = path.split('/').pop() || 'unknown';
  const timestamp = Date.now().toString(36);
  return `sacl-${repoName}-${timestamp}`;
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
SACL MCP Server - Semantic-Augmented Code Retrieval

USAGE:
  npm start
  node dist/index.js

ENVIRONMENT VARIABLES:
  Required:
    OPENAI_API_KEY           OpenAI API key for LLM operations

  Optional:
    SACL_REPO_PATH          Repository path to analyze (default: current directory)
    SACL_NAMESPACE          Unique namespace for this repository (auto-generated)
    SACL_LLM_MODEL          LLM model to use (default: gpt-4)
    SACL_EMBEDDING_MODEL    Embedding model (default: text-embedding-3-small)
    SACL_BIAS_THRESHOLD     Bias detection threshold 0-1 (default: 0.5)
    SACL_MAX_RESULTS        Max search results (default: 10)
    SACL_CACHE_ENABLED      Enable embedding cache (default: true)
    
    NEO4J_URI               Neo4j connection URI (default: bolt://localhost:7687)
    NEO4J_USER              Neo4j username (default: neo4j)
    NEO4J_PASSWORD          Neo4j password (default: password)

EXAMPLES:
  # Start with default settings
  npm start

  # Custom repository and namespace
  SACL_REPO_PATH=/path/to/repo SACL_NAMESPACE=my-project npm start

  # Higher bias sensitivity
  SACL_BIAS_THRESHOLD=0.3 npm start

MCP INTEGRATION:
  Configure your MCP client (Claude, Cursor, etc.) to connect to this server
  using stdio transport. The server provides bias-aware code retrieval
  capabilities through the SACL framework.

For more information, see: https://github.com/yourusername/sacl-mcp-server
`);
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Start the server
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});