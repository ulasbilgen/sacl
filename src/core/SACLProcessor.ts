import { CodeRepresentation, SACLConfig, ProcessingStats, RetrievalResult, EnhancedRetrievalResult } from '../types/index.js';
import { TextualBiasDetector } from './BiasDetector.js';
import { SemanticAugmenter } from './SemanticAugmenter.js';
import { SACLReranker } from './SACLReranker.js';
import { GraphitiClient, GraphitiConfig } from '../graphiti/GraphitiClient.js';
import { CodeAnalyzer } from '../utils/CodeAnalyzer.js';

/**
 * SACLProcessor orchestrates the complete SACL pipeline
 * Implements the full Semantic-Augmented Reranking and Localization framework
 */
export class SACLProcessor {
  private config: SACLConfig;
  private biasDetector: TextualBiasDetector;
  private semanticAugmenter: SemanticAugmenter;
  private reranker: SACLReranker;
  private graphitiClient: GraphitiClient;
  private codeAnalyzer: CodeAnalyzer;
  private cache: Map<string, CodeRepresentation>;

  constructor(config: SACLConfig, graphitiConfig: GraphitiConfig) {
    this.config = config;
    this.cache = new Map();
    
    // Initialize SACL components
    this.biasDetector = new TextualBiasDetector();
    this.semanticAugmenter = new SemanticAugmenter(graphitiConfig.openaiApiKey);
    this.graphitiClient = new GraphitiClient(graphitiConfig);
    this.reranker = new SACLReranker(this.graphitiClient); // Pass GraphitiClient for enhanced results
    this.codeAnalyzer = new CodeAnalyzer();
  }

  /**
   * Initialize the SACL system for a repository
   * Performs initial full scan as per requirements
   */
  async initialize(): Promise<void> {
    console.log(`Initializing SACL for repository: ${this.config.repositoryPath}`);
    console.log(`Namespace: ${this.config.namespace}`);
    
    try {
      // Perform initial full repository scan
      await this.processRepository();
      
      // File watching removed - using explicit agent-controlled updates
      
      console.log('SACL initialization completed successfully');
    } catch (error) {
      console.error('SACL initialization failed:', error);
      throw error;
    }
  }

  /**
   * Process entire repository (initial scan)
   */
  async processRepository(): Promise<ProcessingStats> {
    const startTime = Date.now();
    const stats: ProcessingStats = {
      filesProcessed: 0,
      totalFiles: 0,
      biasDetected: 0,
      averageBiasScore: 0,
      processingTime: 0
    };

    try {
      // Get all code files in repository
      const codeFiles = await this.codeAnalyzer.findCodeFiles(this.config.repositoryPath);
      stats.totalFiles = codeFiles.length;
      
      console.log(`Found ${codeFiles.length} code files to process`);
      
      let totalBiasScore = 0;
      
      // Process each file through SACL pipeline
      for (const filePath of codeFiles) {
        try {
          const processed = await this.processFile(filePath);
          if (processed) {
            stats.filesProcessed++;
            totalBiasScore += processed.biasScore;
            
            if (processed.biasScore > this.config.biasThreshold) {
              stats.biasDetected++;
            }
            
            // Store in knowledge graph
            await this.graphitiClient.storeCodeRepresentation(processed);
            
            // Cache if enabled
            if (this.config.cacheEnabled) {
              this.cache.set(filePath, processed);
            }
          }
        } catch (error) {
          console.error(`Failed to process file ${filePath}:`, error);
        }
      }
      
      stats.averageBiasScore = stats.filesProcessed > 0 ? totalBiasScore / stats.filesProcessed : 0;
      stats.processingTime = Date.now() - startTime;
      
      console.log(`Processing completed: ${stats.filesProcessed}/${stats.totalFiles} files`);
      console.log(`Average bias score: ${stats.averageBiasScore.toFixed(3)}`);
      console.log(`High bias files: ${stats.biasDetected}`);
      
      return stats;
      
    } catch (error) {
      console.error('Repository processing failed:', error);
      throw error;
    }
  }

  /**
   * Process single file through SACL pipeline
   */
  async processFile(filePath: string): Promise<CodeRepresentation | null> {
    try {
      console.log(`Processing file: ${filePath}`);
      
      // 1. Analyze code structure and extract features
      const codeRep = await this.codeAnalyzer.analyzeFile(filePath);
      if (!codeRep) {
        return null;
      }
      
      // 2. Detect textual bias (Stage 0)
      const biasScore = await this.biasDetector.detectBias(codeRep);
      codeRep.biasScore = biasScore;
      
      // 3. Semantic augmentation (Stage 1)
      const augmented = await this.semanticAugmenter.augmentRepresentation(codeRep);
      
      // 4. Store relationships in knowledge graph (NEW)
      if (augmented.relationships) {
        await this.graphitiClient.storeFileRelationships(filePath, augmented.relationships);
        console.log(`  Relationships stored: ${augmented.relationships.imports.length} imports, ${augmented.relationships.functionCalls.length} calls`);
      }
      
      console.log(`  Bias score: ${biasScore.toFixed(3)}`);
      console.log(`  Semantic features: ${augmented.semanticFeatures.behaviorPattern}`);
      
      return augmented;
      
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Enhanced query with relationship context (NEW - Phase 5)
   */
  async queryCodeWithContext(query: string, maxResults?: number): Promise<EnhancedRetrievalResult[]> {
    const limit = maxResults || this.config.maxResults;
    
    try {
      console.log(`SACL Enhanced Query: "${query}"`);
      
      // 1. Initial retrieval from knowledge graph
      const initialResults = await this.graphitiClient.searchCode(query, limit * 2);
      
      if (initialResults.length === 0) {
        console.log('No initial results found');
        return [];
      }
      
      // 2. Enhanced SACL reranking with relationship context (Stage 2+)
      const enhancedResults = await this.reranker.rerankWithContext(initialResults, query, limit);
      
      console.log(`Enhanced reranked ${initialResults.length} → ${enhancedResults.length} results with context`);
      
      return enhancedResults;
      
    } catch (error) {
      console.error('Enhanced query failed:', error);
      throw error;
    }
  }

  /**
   * Query code using SACL-enhanced retrieval (basic version)
   */
  async queryCode(query: string, maxResults?: number): Promise<RetrievalResult[]> {
    const limit = maxResults || this.config.maxResults;
    
    try {
      console.log(`SACL Query: "${query}"`);
      
      // 1. Initial retrieval from knowledge graph
      const initialResults = await this.graphitiClient.searchCode(query, limit * 2);
      
      if (initialResults.length === 0) {
        console.log('No initial results found');
        return [];
      }
      
      // 2. SACL reranking and localization (Stage 2)
      const rerankedResults = await this.reranker.rerank(initialResults, query, limit);
      
      console.log(`Reranked ${initialResults.length} → ${rerankedResults.length} results`);
      
      return rerankedResults;
      
    } catch (error) {
      console.error('Query failed:', error);
      throw error;
    }
  }

  /**
   * Update single file (explicit agent-controlled update)
   */
  async updateFile(filePath: string, changeType: 'created' | 'modified' | 'deleted'): Promise<{success: boolean, message: string}> {
    try {
      console.log(`Explicit update - File ${changeType}: ${filePath}`);
      
      // Validate file path is within repository
      if (!this.validateFilePath(filePath)) {
        return { success: false, message: `File path ${filePath} is outside repository` };
      }
      
      switch (changeType) {
        case 'created':
        case 'modified':
          const processed = await this.processFile(filePath);
          if (processed) {
            await this.graphitiClient.storeCodeRepresentation(processed);
            if (this.config.cacheEnabled) {
              this.cache.set(filePath, processed);
            }
            return { success: true, message: `File ${filePath} processed successfully. Bias score: ${processed.biasScore.toFixed(3)}` };
          } else {
            return { success: false, message: `Failed to process file ${filePath}` };
          }
          
        case 'deleted':
          // Remove from cache and knowledge graph
          this.cache.delete(filePath);
          await this.graphitiClient.deleteFileRelationships(filePath);
          return { success: true, message: `File ${filePath} removed from cache and knowledge graph` };
          
        default:
          return { success: false, message: `Unknown change type: ${changeType}` };
      }
      
    } catch (error) {
      console.error(`Failed to update file ${filePath}:`, error);
      return { success: false, message: `Error updating file: ${error}` };
    }
  }

  /**
   * Update multiple files in batch (explicit agent-controlled update)
   */
  async updateFiles(files: Array<{filePath: string, changeType: 'created' | 'modified' | 'deleted'}>): Promise<{
    totalFiles: number,
    successfulUpdates: number,
    failedUpdates: number,
    results: Array<{filePath: string, success: boolean, message: string}>
  }> {
    const results = [];
    let successfulUpdates = 0;
    let failedUpdates = 0;

    console.log(`Batch update: Processing ${files.length} files`);
    
    for (const file of files) {
      const result = await this.updateFile(file.filePath, file.changeType);
      results.push({
        filePath: file.filePath,
        success: result.success,
        message: result.message
      });
      
      if (result.success) {
        successfulUpdates++;
      } else {
        failedUpdates++;
      }
    }
    
    console.log(`Batch update completed: ${successfulUpdates} successful, ${failedUpdates} failed`);
    
    return {
      totalFiles: files.length,
      successfulUpdates,
      failedUpdates,
      results
    };
  }

  /**
   * Validate file path is within repository bounds
   */
  private validateFilePath(filePath: string): boolean {
    // Basic validation - ensure file is within repository path
    const normalizedRepoPath = this.config.repositoryPath.replace(/\\/g, '/');
    const normalizedFilePath = filePath.replace(/\\/g, '/');
    
    return normalizedFilePath.startsWith(normalizedRepoPath) || 
           normalizedFilePath.startsWith('./') ||
           !normalizedFilePath.startsWith('/');
  }

  /**
   * Get detailed bias analysis
   */
  async getBiasAnalysis(filePath?: string): Promise<any> {
    try {
      const biasMetrics = await this.graphitiClient.getBiasMetrics(filePath);
      
      if (filePath && this.cache.has(filePath)) {
        const code = this.cache.get(filePath)!;
        const indicators = await this.biasDetector.getBiasIndicators(code);
        
        return {
          ...biasMetrics,
          fileSpecific: {
            path: filePath,
            biasScore: code.biasScore,
            indicators,
            semanticFeatures: code.semanticFeatures
          }
        };
      }
      
      return biasMetrics;
      
    } catch (error) {
      console.error('Failed to get bias analysis:', error);
      throw error;
    }
  }

  /**
   * Get related components for a file (NEW - Phase 4)
   */
  async getRelatedComponents(filePath: string, maxDepth: number = 3): Promise<any> {
    try {
      const relatedComponents = await this.graphitiClient.getRelatedComponents(filePath, { maxDepth });
      
      return {
        primaryFile: filePath,
        relatedComponents,
        traversalDepth: maxDepth,
        totalRelated: relatedComponents.length
      };
      
    } catch (error) {
      console.error(`Failed to get related components for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Get relationship graph for a file (NEW - Phase 4)
   */
  async getRelationshipGraph(filePath: string, relationshipTypes?: string[]): Promise<any> {
    try {
      const traversalResult = await this.graphitiClient.traverseRelationships(
        filePath, 
        relationshipTypes || ['imports', 'exports', 'calls', 'extends', 'implements'],
        3
      );
      
      return traversalResult;
      
    } catch (error) {
      console.error(`Failed to get relationship graph for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Get system statistics
   */
  async getSystemStats(): Promise<any> {
    try {
      const graphitiStats = await this.graphitiClient.getStats();
      
      return {
        ...graphitiStats,
        config: {
          namespace: this.config.namespace,
          biasThreshold: this.config.biasThreshold,
          cacheEnabled: this.config.cacheEnabled,
          maxResults: this.config.maxResults
        },
        cache: {
          size: this.cache.size,
          enabled: this.config.cacheEnabled
        }
      };
      
    } catch (error) {
      console.error('Failed to get system stats:', error);
      throw error;
    }
  }


  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      // Clear cache
      this.cache.clear();
      console.log('SACL processor cleanup completed');
      
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }
}