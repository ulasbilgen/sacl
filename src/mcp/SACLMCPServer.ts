import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { SACLProcessor } from '../core/SACLProcessor.js';
import { GraphitiConfig } from '../graphiti/GraphitiClient.js';
import { SACLConfig, MCPCodeAnalysisRequest, MCPCodeAnalysisResponse } from '../types/index.js';

/**
 * SACL MCP Server provides bias-aware code retrieval for AI coding assistants
 * Implements the Model Context Protocol for integration with Claude Code, Cursor, etc.
 */
export class SACLMCPServer {
  private server: Server;
  private saclProcessor?: SACLProcessor;
  private isInitialized = false;

  constructor() {
    this.server = new Server(
      {
        name: 'sacl-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
    this.setupErrorHandling();
  }

  /**
   * Initialize SACL processor with configuration
   */
  async initialize(saclConfig: SACLConfig, graphitiConfig: GraphitiConfig): Promise<void> {
    try {
      console.log('Initializing SACL MCP Server...');
      
      this.saclProcessor = new SACLProcessor(saclConfig, graphitiConfig);
      await this.saclProcessor.initialize();
      
      this.isInitialized = true;
      console.log('SACL MCP Server initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize SACL MCP Server:', error);
      throw error;
    }
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('SACL MCP Server must be initialized before starting');
    }

    const transport = new StdioServerTransport();
    
    try {
      await this.server.connect(transport);
      console.log('SACL MCP Server started and ready for connections');
    } catch (error) {
      console.error('Failed to start SACL MCP Server:', error);
      throw error;
    }
  }

  /**
   * Stop the server and cleanup
   */
  async stop(): Promise<void> {
    try {
      if (this.saclProcessor) {
        await this.saclProcessor.cleanup();
      }
      
      await this.server.close();
      console.log('SACL MCP Server stopped');
      
    } catch (error) {
      console.error('Error stopping SACL MCP Server:', error);
    }
  }

  /**
   * Setup MCP tools for SACL functionality
   */
  private setupTools(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'analyze_repository',
            description: 'Analyze entire repository for bias-aware code understanding using SACL framework',
            inputSchema: {
              type: 'object',
              properties: {
                repositoryPath: {
                  type: 'string',
                  description: 'Path to the repository to analyze'
                },
                incremental: {
                  type: 'boolean',
                  description: 'Whether to perform incremental analysis (default: false for full scan)',
                  default: false
                }
              },
              required: ['repositoryPath']
            }
          },
          {
            name: 'query_code',
            description: 'Search code using SACL bias-aware retrieval with semantic augmentation',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language query for code functionality'
                },
                repositoryPath: {
                  type: 'string',
                  description: 'Repository to search in'
                },
                maxResults: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                  default: 10
                },
                includeContext: {
                  type: 'boolean',
                  description: 'Include relationship context in results (default: false)',
                  default: false
                }
              },
              required: ['query', 'repositoryPath']
            }
          },
          {
            name: 'get_bias_analysis',
            description: 'Get detailed bias analysis and metrics for debugging SACL decisions',
            inputSchema: {
              type: 'object',
              properties: {
                filePath: {
                  type: 'string',
                  description: 'Specific file to analyze (optional, analyzes all if not provided)'
                }
              }
            }
          },
          {
            name: 'get_system_stats',
            description: 'Get SACL system statistics and performance metrics',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'update_file',
            description: 'Update single file analysis when changes are made (explicit agent-controlled)',
            inputSchema: {
              type: 'object',
              properties: {
                filePath: {
                  type: 'string',
                  description: 'Path to the file that was changed'
                },
                changeType: {
                  type: 'string',
                  enum: ['created', 'modified', 'deleted'],
                  description: 'Type of change made to the file'
                }
              },
              required: ['filePath', 'changeType']
            }
          },
          {
            name: 'update_files',
            description: 'Update multiple files analysis in batch (explicit agent-controlled)',
            inputSchema: {
              type: 'object',
              properties: {
                files: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      filePath: {
                        type: 'string',
                        description: 'Path to the file that was changed'
                      },
                      changeType: {
                        type: 'string',
                        enum: ['created', 'modified', 'deleted'],
                        description: 'Type of change made to the file'
                      }
                    },
                    required: ['filePath', 'changeType']
                  },
                  description: 'Array of file changes to process'
                }
              },
              required: ['files']
            }
          },
          {
            name: 'get_relationships',
            description: 'Get code relationships and dependency analysis for a file',
            inputSchema: {
              type: 'object',
              properties: {
                filePath: {
                  type: 'string',
                  description: 'File to analyze relationships for'
                },
                maxDepth: {
                  type: 'number',
                  description: 'Maximum relationship traversal depth (default: 3)',
                  default: 3
                },
                relationshipTypes: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['imports', 'exports', 'calls', 'extends', 'implements', 'uses', 'depends_on']
                  },
                  description: 'Types of relationships to include (default: all)'
                }
              },
              required: ['filePath']
            }
          },
          {
            name: 'get_file_context',
            description: 'Get comprehensive context and related components for a file',
            inputSchema: {
              type: 'object',
              properties: {
                filePath: {
                  type: 'string',
                  description: 'File to get context for'
                },
                includeSnippets: {
                  type: 'boolean',
                  description: 'Include code snippets of related components (default: false)',
                  default: false
                }
              },
              required: ['filePath']
            }
          },
          {
            name: 'query_code_with_context',
            description: 'Enhanced code search with relationship context and related components',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language query for code functionality'
                },
                repositoryPath: {
                  type: 'string',
                  description: 'Repository to search in'
                },
                maxResults: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                  default: 10
                },
                includeRelated: {
                  type: 'boolean',
                  description: 'Include related components in results (default: true)',
                  default: true
                }
              },
              required: ['query', 'repositoryPath']
            }
          }
        ] satisfies Tool[]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.saclProcessor) {
        throw new Error('SACL processor not initialized');
      }

      try {
        switch (name) {
          case 'analyze_repository':
            return await this.handleAnalyzeRepository(args);
            
          case 'query_code':
            return await this.handleQueryCode(args);
            
          case 'get_bias_analysis':
            return await this.handleGetBiasAnalysis(args);
            
          case 'get_system_stats':
            return await this.handleGetSystemStats();

          case 'update_file':
            return await this.handleUpdateFile(args);

          case 'update_files':
            return await this.handleUpdateFiles(args);

          case 'get_relationships':
            return await this.handleGetRelationships(args);

          case 'get_file_context':
            return await this.handleGetFileContext(args);

          case 'query_code_with_context':
            return await this.handleQueryCodeWithContext(args);
            
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error handling tool ${name}:`, error);
        throw error;
      }
    });
  }

  /**
   * Validate required parameters and return clear error messages for LLMs
   */
  private validateParameters(toolName: string, args: any, required: string[]): { isValid: boolean; error?: string } {
    for (const param of required) {
      if (!args[param] || (typeof args[param] === 'string' && args[param].trim() === '')) {
        return {
          isValid: false,
          error: `❌ Missing required parameter '${param}' for tool '${toolName}'. Please provide a valid ${param}.`
        };
      }
    }
    return { isValid: true };
  }

  /**
   * Generate namespace from repository path
   */
  private generateNamespace(repositoryPath: string): string {
    const normalizedPath = repositoryPath.replace(/[^a-zA-Z0-9]/g, '-');
    const timestamp = Date.now().toString(36);
    return `sacl-${normalizedPath}-${timestamp}`;
  }

  /**
   * Handle repository analysis tool
   */
  private async handleAnalyzeRepository(args: any): Promise<any> {
    try {
      // Validate required parameters
      const validation = this.validateParameters('analyze_repository', args, ['repositoryPath']);
      if (!validation.isValid) {
        return {
          content: [{
            type: 'text',
            text: validation.error!
          }]
        };
      }

      const { repositoryPath, incremental = false } = args;

      console.log(`Analyzing repository: ${repositoryPath} (incremental: ${incremental})`);

      // Generate namespace for this repository
      const namespace = this.generateNamespace(repositoryPath);

      if (!incremental) {
        // Full repository analysis with specific path and namespace
        const stats = await this.saclProcessor!.processRepository(repositoryPath, namespace);
        
        return {
          content: [{
            type: 'text',
            text: `📊 Repository Analysis Complete\n\n` +
                  `**Repository:** ${repositoryPath}\n` +
                  `**Namespace:** ${namespace}\n\n` +
                  `**Processing Statistics:**\n` +
                  `• Files processed: ${stats.filesProcessed}/${stats.totalFiles}\n` +
                  `• Average bias score: ${stats.averageBiasScore.toFixed(3)}\n` +
                  `• High bias files detected: ${stats.biasDetected}\n` +
                  `• Processing time: ${(stats.processingTime / 1000).toFixed(1)}s\n\n` +
                  `🔍 **SACL Framework Applied:**\n` +
                  `• Textual bias detection completed\n` +
                  `• Semantic augmentation applied\n` +
                  `• Knowledge graph populated\n` +
                  `• Ready for bias-aware code retrieval\n\n` +
                  `Use 'query_code' to search with reduced textual bias.`
          }]
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: `✅ Incremental analysis mode enabled for repository: ${repositoryPath}\n\n` +
                  `File changes will be processed as they are reported through 'update_file' or 'update_files' tools.`
          }]
        };
      }
    } catch (error) {
      console.error('Error in handleAnalyzeRepository:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Repository analysis failed: ${error instanceof Error ? error.message : 'Unknown error occurred'}\n\n` +
                `Please ensure:\n` +
                `• Repository path exists and is accessible\n` +
                `• Path contains valid code files\n` +
                `• Neo4j database is running and accessible`
        }]
      };
    }
  }

  /**
   * Handle code query tool
   */
  private async handleQueryCode(args: any): Promise<any> {
    try {
      // Validate required parameters
      const validation = this.validateParameters('query_code', args, ['query', 'repositoryPath']);
      if (!validation.isValid) {
        return {
          content: [{
            type: 'text',
            text: validation.error!
          }]
        };
      }

      const { query, repositoryPath, maxResults = 10, includeContext = false } = args;

      console.log(`Code query: "${query}" in repository: ${repositoryPath} (context: ${includeContext})`);

      // Use enhanced query if context is requested
      if (includeContext) {
        return await this.handleQueryCodeWithContext({ query, repositoryPath, maxResults, includeRelated: true });
      }

      // Generate namespace for this repository
      const namespace = this.generateNamespace(repositoryPath);

      const results = await this.saclProcessor!.queryCode(query, maxResults, repositoryPath, namespace);

    if (results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No results found for query: "${query}"\n\nTry:\n• More specific functional terms\n• Different technical keywords\n• Broader search terms`
        }]
      };
    }

    // Format results for MCP response
    let responseText = `🔍 **SACL Query Results for:** "${query}"\n\n`;
    responseText += `Found ${results.length} bias-aware matches:\n\n`;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const code = result.codeSnippet;
      
      responseText += `**${i + 1}. ${code.filePath}**\n`;
      responseText += `• Bias Score: ${(code.biasScore * 100).toFixed(1)}% ${this.getBiasEmoji(code.biasScore)}\n`;
      responseText += `• SACL Score: ${(result.biasAdjustedScore * 100).toFixed(1)}%\n`;
      responseText += `• Pattern: ${code.semanticFeatures.behaviorPattern}\n`;
      
      if (result.localizationRegions.length > 0) {
        responseText += `• Key Region: Lines ${result.localizationRegions[0].startLine}-${result.localizationRegions[0].endLine}\n`;
      }
      
      responseText += `\`\`\`\n${code.content.slice(0, 300)}${code.content.length > 300 ? '...' : ''}\n\`\`\`\n\n`;
      
      if (result.explanation) {
        responseText += `📝 ${result.explanation}\n\n`;
      }
      
      responseText += '---\n\n';
    }

    return {
      content: [{
        type: 'text',
        text: responseText
      }]
    };
    } catch (error) {
      console.error('Error in handleQueryCode:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Code query failed: ${error instanceof Error ? error.message : 'Unknown error occurred'}\n\n` +
                `Please ensure:\n` +
                `• Repository "${args.repositoryPath || 'unknown'}" has been analyzed first using 'analyze_repository'\n` +
                `• Query contains valid search terms\n` +
                `• Neo4j database is accessible`
        }]
      };
    }
  }

  /**
   * Handle bias analysis tool
   */
  private async handleGetBiasAnalysis(args: any): Promise<any> {
    const { filePath } = args;

    const analysis = await this.saclProcessor!.getBiasAnalysis(filePath);

    let responseText = `🧠 **SACL Bias Analysis**\n\n`;
    
    if (filePath) {
      responseText += `**File:** ${filePath}\n\n`;
      
      if (analysis.fileSpecific) {
        const fs = analysis.fileSpecific;
        responseText += `**Bias Metrics:**\n`;
        responseText += `• Overall Bias Score: ${(fs.biasScore * 100).toFixed(1)}% ${this.getBiasEmoji(fs.biasScore)}\n`;
        responseText += `• Semantic Pattern: ${fs.semanticFeatures.behaviorPattern}\n`;
        responseText += `• Functional Signature: ${fs.semanticFeatures.functionalSignature}\n\n`;
        
        if (fs.indicators && fs.indicators.length > 0) {
          responseText += `**Bias Indicators:**\n`;
          for (const indicator of fs.indicators) {
            responseText += `• ${indicator.type}: ${indicator.description}\n`;
          }
          responseText += '\n';
        }
      }
    }

    responseText += `**Repository Overview:**\n`;
    responseText += `• Average Bias Score: ${(analysis.averageBiasScore * 100).toFixed(1)}%\n`;
    responseText += `• High Bias Files: ${analysis.highBiasFiles.length}\n`;
    responseText += `• Distribution: ${analysis.biasDistribution.low} low, ${analysis.biasDistribution.medium} medium, ${analysis.biasDistribution.high} high\n\n`;

    if (analysis.improvementSuggestions.length > 0) {
      responseText += `**💡 Improvement Suggestions:**\n`;
      for (const suggestion of analysis.improvementSuggestions) {
        responseText += `• ${suggestion}\n`;
      }
    }

    return {
      content: [{
        type: 'text',
        text: responseText
      }]
    };
  }

  /**
   * Handle system stats tool
   */
  private async handleGetSystemStats(): Promise<any> {
    const stats = await this.saclProcessor!.getSystemStats();

    const responseText = `⚙️ **SACL System Statistics**\n\n` +
      `**Repository Processing:**\n` +
      `• Total Files: ${stats.totalFiles}\n` +
      `• Processed Files: ${stats.processedFiles}\n` +
      `• Knowledge Graph Nodes: ${stats.totalNodes}\n` +
      `• Knowledge Graph Edges: ${stats.totalEdges}\n` +
      `• Last Update: ${stats.lastUpdate.toLocaleString()}\n` +
      `• Storage Size: ${stats.namespaceSize}\n\n` +
      `**Configuration:**\n` +
      `• Namespace: ${stats.config.namespace}\n` +
      `• Bias Threshold: ${stats.config.biasThreshold}\n` +
      `• Max Results: ${stats.config.maxResults}\n` +
      `• Cache Enabled: ${stats.config.cacheEnabled}\n` +
      `• Cache Size: ${stats.cache.size} items\n\n` +
      `**SACL Framework Status:**\n` +
      `• ✅ Bias Detection Active\n` +
      `• ✅ Semantic Augmentation Active\n` +
      `• ✅ Reranking & Localization Active\n` +
      `• ✅ Knowledge Graph Integration Active\n` +
      `• ✅ Relationship Analysis Active\n` +
      `• ✅ Context-Aware Retrieval Active\n\n` +
      `**Available Tools:**\n` +
      `• analyze_repository - Full repository processing\n` +
      `• query_code - Basic SACL search\n` +
      `• query_code_with_context - Enhanced search with relationships\n` +
      `• update_file / update_files - Explicit file updates\n` +
      `• get_relationships - Code relationship analysis\n` +
      `• get_file_context - File context and dependencies\n` +
      `• get_bias_analysis - Bias metrics and insights\n` +
      `• get_system_stats - System status and configuration`;

    return {
      content: [{
        type: 'text',
        text: responseText
      }]
    };
  }

  /**
   * Handle update single file tool (NEW - Phase 6)
   */
  private async handleUpdateFile(args: any): Promise<any> {
    try {
      // Validate required parameters
      const validation = this.validateParameters('update_file', args, ['filePath', 'changeType']);
      if (!validation.isValid) {
        return {
          content: [{
            type: 'text',
            text: validation.error!
          }]
        };
      }

      const { filePath, changeType } = args;

      console.log(`Update file: ${filePath} (${changeType})`);

      const result = await this.saclProcessor!.updateFile(filePath, changeType);

    let responseText = `📝 **File Update Result**\n\n`;
    responseText += `**File:** ${filePath}\n`;
    responseText += `**Change Type:** ${changeType}\n`;
    responseText += `**Status:** ${result.success ? '✅ Success' : '❌ Failed'}\n`;
    responseText += `**Message:** ${result.message}\n\n`;

    if (result.success && changeType !== 'deleted') {
      responseText += `🔍 **SACL Analysis Updated:**\n`;
      responseText += `• Bias detection applied\n`;
      responseText += `• Semantic augmentation completed\n`;
      responseText += `• Relationships extracted and stored\n`;
      responseText += `• Knowledge graph updated\n\n`;
      responseText += `File is now ready for bias-aware retrieval.`;
    }

    return {
      content: [{
        type: 'text',
        text: responseText
      }]
    };
    } catch (error) {
      console.error('Error in handleUpdateFile:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ File update failed: ${error instanceof Error ? error.message : 'Unknown error occurred'}\n\n` +
                `Please ensure:\n` +
                `• File path "${args.filePath || 'unknown'}" is valid and accessible\n` +
                `• Change type "${args.changeType || 'unknown'}" is valid (created, modified, deleted)\n` +
                `• File contains valid code for analysis`
        }]
      };
    }
  }

  /**
   * Handle update multiple files tool (NEW - Phase 6)
   */
  private async handleUpdateFiles(args: any): Promise<any> {
    const { files } = args;

    console.log(`Batch update: ${files.length} files`);

    const result = await this.saclProcessor!.updateFiles(files);

    let responseText = `📁 **Batch File Update Result**\n\n`;
    responseText += `**Total Files:** ${result.totalFiles}\n`;
    responseText += `**Successful:** ${result.successfulUpdates} ✅\n`;
    responseText += `**Failed:** ${result.failedUpdates} ❌\n\n`;

    if (result.results.length > 0) {
      responseText += `**Individual Results:**\n`;
      for (const fileResult of result.results) {
        const status = fileResult.success ? '✅' : '❌';
        responseText += `${status} ${fileResult.filePath}: ${fileResult.message}\n`;
      }
      responseText += '\n';
    }

    if (result.successfulUpdates > 0) {
      responseText += `🔍 **SACL Analysis Completed:**\n`;
      responseText += `• ${result.successfulUpdates} files analyzed for bias\n`;
      responseText += `• Semantic features extracted\n`;
      responseText += `• Code relationships mapped\n`;
      responseText += `• Knowledge graph updated\n\n`;
      responseText += `Updated files are ready for enhanced code retrieval.`;
    }

    return {
      content: [{
        type: 'text',
        text: responseText
      }]
    };
  }

  /**
   * Handle get relationships tool (NEW - Phase 6)
   */
  private async handleGetRelationships(args: any): Promise<any> {
    const { filePath, maxDepth = 3, relationshipTypes } = args;

    console.log(`Get relationships: ${filePath}`);

    const result = await this.saclProcessor!.getRelationshipGraph(filePath, relationshipTypes);

    let responseText = `🔗 **Code Relationships Analysis**\n\n`;
    responseText += `**File:** ${filePath}\n`;
    responseText += `**Traversal Depth:** ${maxDepth}\n`;
    responseText += `**Related Components:** ${result.relatedComponents.length}\n\n`;

    if (result.relatedComponents.length === 0) {
      responseText += `No significant relationships found for this file.\n\n`;
      responseText += `This could mean:\n`;
      responseText += `• File is standalone with minimal dependencies\n`;
      responseText += `• File hasn't been processed yet (run analyze_repository first)\n`;
      responseText += `• Relationships exist but don't meet relevance threshold`;
    } else {
      responseText += `**Key Relationships:**\n`;
      
      for (let i = 0; i < Math.min(result.relatedComponents.length, 10); i++) {
        const comp = result.relatedComponents[i];
        responseText += `${i + 1}. **${comp.componentName}** (${comp.relationshipType})\n`;
        responseText += `   • File: ${comp.filePath}\n`;
        responseText += `   • Relationship: ${comp.relationshipDescription}\n`;
        responseText += `   • Relevance: ${(comp.relevanceScore * 100).toFixed(1)}%\n`;
        responseText += `   • Distance: ${comp.distance} hop${comp.distance !== 1 ? 's' : ''}\n`;
        if (comp.snippet && comp.snippet.length > 0) {
          responseText += `   • Preview: ${comp.snippet.slice(0, 100)}...\n`;
        }
        responseText += `\n`;
      }

      if (result.traversalStats) {
        responseText += `**Traversal Statistics:**\n`;
        responseText += `• Nodes Visited: ${result.traversalStats.nodesVisited}\n`;
        responseText += `• Edges Traversed: ${result.traversalStats.edgesTraversed}\n`;
        responseText += `• Max Depth Reached: ${result.traversalStats.maxDepthReached}\n`;
        responseText += `• Processing Time: ${result.traversalStats.processingTime}ms\n`;
      }
    }

    return {
      content: [{
        type: 'text',
        text: responseText
      }]
    };
  }

  /**
   * Handle get file context tool (NEW - Phase 6)
   */
  private async handleGetFileContext(args: any): Promise<any> {
    const { filePath, includeSnippets = false } = args;

    console.log(`Get file context: ${filePath}`);

    const relatedResult = await this.saclProcessor!.getRelatedComponents(filePath);

    let responseText = `🎯 **File Context Analysis**\n\n`;
    responseText += `**File:** ${filePath}\n`;
    responseText += `**Total Related:** ${relatedResult.totalRelated}\n\n`;

    if (relatedResult.relatedComponents.length === 0) {
      responseText += `**Context:** Standalone component\n\n`;
      responseText += `This file appears to have minimal dependencies and relationships.\n`;
      responseText += `Consider running 'analyze_repository' if this seems incorrect.`;
    } else {
      // Group relationships by type
      const grouped = relatedResult.relatedComponents.reduce((acc: any, comp) => {
        if (!acc[comp.relationshipType]) {
          acc[comp.relationshipType] = [];
        }
        acc[comp.relationshipType].push(comp);
        return acc;
      }, {});

      responseText += `**Context Summary:**\n`;
      for (const [type, components] of Object.entries(grouped)) {
        responseText += `• ${type}: ${(components as any[]).length} components\n`;
      }
      responseText += `\n`;

      responseText += `**Relationship Breakdown:**\n`;
      for (const [type, components] of Object.entries(grouped)) {
        responseText += `\n**${type.toUpperCase()} (${(components as any[]).length}):**\n`;
        
        for (const comp of (components as any[]).slice(0, 5)) {
          responseText += `• ${comp.componentName}\n`;
          responseText += `  └─ ${comp.relationshipDescription}\n`;
          if (includeSnippets && comp.snippet) {
            responseText += `  └─ Code: ${comp.snippet.slice(0, 80)}...\n`;
          }
        }
        
        if ((components as any[]).length > 5) {
          responseText += `  ... and ${(components as any[]).length - 5} more\n`;
        }
      }

      responseText += `\n**Usage Recommendations:**\n`;
      responseText += `• Use 'query_code_with_context' to find similar patterns\n`;
      responseText += `• Check imports/exports when modifying interfaces\n`;
      responseText += `• Consider impact on calling functions when refactoring\n`;
    }

    return {
      content: [{
        type: 'text',
        text: responseText
      }]
    };
  }

  /**
   * Handle enhanced query with context tool (NEW - Phase 6)
   */
  private async handleQueryCodeWithContext(args: any): Promise<any> {
    try {
      // Validate required parameters
      const validation = this.validateParameters('query_code_with_context', args, ['query', 'repositoryPath']);
      if (!validation.isValid) {
        return {
          content: [{
            type: 'text',
            text: validation.error!
          }]
        };
      }

      const { query, repositoryPath, maxResults = 10, includeRelated = true } = args;

      console.log(`Enhanced query with context: "${query}" in repository: ${repositoryPath}`);

      // Generate namespace for this repository
      const namespace = this.generateNamespace(repositoryPath);

      const results = await this.saclProcessor!.queryCodeWithContext(query, maxResults, repositoryPath, namespace);

    if (results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No results found for query: "${query}"\n\nTry:\n• More specific functional terms\n• Different technical keywords\n• Broader search terms`
        }]
      };
    }

    let responseText = `🔍 **Enhanced SACL Query Results for:** "${query}"\n\n`;
    responseText += `Found ${results.length} context-aware matches:\n\n`;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const code = result.codeSnippet;
      
      responseText += `**${i + 1}. ${code.filePath}**\n`;
      responseText += `• Bias Score: ${(code.biasScore * 100).toFixed(1)}% ${this.getBiasEmoji(code.biasScore)}\n`;
      responseText += `• SACL Score: ${(result.biasAdjustedScore * 100).toFixed(1)}%\n`;
      responseText += `• Pattern: ${code.semanticFeatures.behaviorPattern}\n`;
      
      if (result.localizationRegions.length > 0) {
        responseText += `• Key Region: Lines ${result.localizationRegions[0].startLine}-${result.localizationRegions[0].endLine}\n`;
      }

      // Show relationship context
      if (result.relatedComponents && result.relatedComponents.length > 0) {
        responseText += `• Related Components: ${result.relatedComponents.length}\n`;
        const topRelated = result.relatedComponents.slice(0, 3);
        for (const related of topRelated) {
          responseText += `  └─ ${related.componentName} (${related.relationshipType})\n`;
        }
      }
      
      responseText += `\n\`\`\`\n${code.content.slice(0, 300)}${code.content.length > 300 ? '...' : ''}\n\`\`\`\n\n`;
      
      // Show context explanation
      if (result.contextExplanation) {
        responseText += `🧠 **Context:** ${result.contextExplanation.contextSummary}\n\n`;
        
        if (result.contextExplanation.keyRelationships.length > 0) {
          responseText += `**Key Dependencies:**\n`;
          for (const rel of result.contextExplanation.keyRelationships) {
            const importance = rel.importance === 'high' ? '🔴' : rel.importance === 'medium' ? '🟡' : '🟢';
            responseText += `${importance} ${rel.type}: ${rel.description}\n`;
          }
          responseText += `\n`;
        }
      }
      
      if (result.explanation) {
        responseText += `📝 ${result.explanation}\n\n`;
      }
      
      responseText += '---\n\n';
    }

    return {
      content: [{
        type: 'text',
        text: responseText
      }]
    };
    } catch (error) {
      console.error('Error in handleQueryCodeWithContext:', error);
      return {
        content: [{
          type: 'text',
          text: `❌ Enhanced query failed: ${error instanceof Error ? error.message : 'Unknown error occurred'}\n\n` +
                `Please ensure:\n` +
                `• Repository "${args.repositoryPath || 'unknown'}" has been analyzed first using 'analyze_repository'\n` +
                `• Query contains valid search terms\n` +
                `• Neo4j database is accessible and contains relationship data`
        }]
      };
    }
  }

  /**
   * Get emoji representation of bias level
   */
  private getBiasEmoji(biasScore: number): string {
    if (biasScore < 0.3) return '🟢';
    if (biasScore < 0.6) return '🟡'; 
    return '🔴';
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('SACL MCP Server error:', error);
    };

    process.on('SIGINT', async () => {
      console.log('Received SIGINT, shutting down gracefully...');
      await this.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      await this.stop();
      process.exit(0);
    });
  }
}