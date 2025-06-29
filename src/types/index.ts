// SACL Framework Types based on research paper
import { CodeRelationships, RelatedComponent, RelationshipGraph, ContextExplanation } from './relationships.js';

export interface CodeRepresentation {
  filePath: string;
  content: string;
  textualFeatures: {
    docstrings: string[];
    comments: string[];
    identifierNames: string[];
    variableNames: string[];
  };
  structuralFeatures: {
    astNodes: number;
    complexity: number;
    nestingDepth: number;
    functionCount: number;
    classCount: number;
  };
  semanticFeatures: {
    embedding: number[];
    functionalSignature: string;
    behaviorPattern: string;
  };
  relationships?: CodeRelationships;  // NEW: Code relationships
  biasScore: number;
  augmentedEmbedding: number[];
  lastModified: Date;
}

export interface RetrievalResult {
  codeSnippet: CodeRepresentation;
  originalScore: number;
  semanticScore: number;
  biasAdjustedScore: number;
  localizationRegions: CodeRegion[];
  explanation: string;
}

// Enhanced retrieval result with relationship context
export interface EnhancedRetrievalResult extends RetrievalResult {
  relatedComponents: RelatedComponent[];      // NEW: Related files/components
  relationshipGraph: RelationshipGraph;      // NEW: Graph representation
  contextExplanation: ContextExplanation;    // NEW: Context description
  dependencyChain: string[];                 // NEW: File dependency chain
}

export interface CodeRegion {
  startLine: number;
  endLine: number;
  relevanceScore: number;
  snippet: string;
}

export interface BiasIndicator {
  type: 'docstring_dependency' | 'identifier_name_bias' | 'comment_over_reliance';
  severity: number;
  location: CodeRegion;
  description: string;
}

export interface SACLConfig {
  repositoryPath: string;
  namespace: string;
  llmModel: string;
  embeddingModel: string;
  biasThreshold: number;
  maxResults: number;
  cacheEnabled: boolean;
}

export interface ProcessingStats {
  filesProcessed: number;
  totalFiles: number;
  biasDetected: number;
  averageBiasScore: number;
  processingTime: number;
}

// MCP-specific types
export interface MCPCodeAnalysisRequest {
  repositoryPath: string;
  query?: string;
  filePattern?: string;
  incremental?: boolean;
}

export interface MCPCodeAnalysisResponse {
  results: EnhancedRetrievalResult[];  // Updated to enhanced results
  stats: ProcessingStats;
  biasMetrics: {
    detectedBiases: BiasIndicator[];
    overallBiasScore: number;
    improvementSuggestions: string[];
  };
}

// File update types for explicit agent updates
export interface FileUpdateRequest {
  filePath: string;
  changeType: 'created' | 'modified' | 'deleted';
}

export interface BatchUpdateRequest {
  files: FileUpdateRequest[];
}

export interface UpdateResponse {
  success: boolean;
  message: string;
  biasScore?: number;
  relationshipsDetected?: number;
}

export interface BatchUpdateResponse {
  totalFiles: number;
  successfulUpdates: number;
  failedUpdates: number;
  results: Array<{
    filePath: string;
    success: boolean;
    message: string;
  }>;
}

// Re-export relationship types
export * from './relationships.js';