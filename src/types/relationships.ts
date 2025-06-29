/**
 * Code Relationship Analysis Types for SACL Framework
 * Defines all relationship types between code components for context-aware retrieval
 */

export interface ImportRelation {
  from: string;        // File that imports
  to: string;          // File being imported
  symbols: string[];   // What's being imported ['UserService', 'validateUser']
  importType: 'default' | 'named' | 'namespace' | 'dynamic';
  lineNumber?: number;
  statement: string;   // Original import statement
}

export interface ExportRelation {
  from: string;        // File that exports
  symbol: string;      // What's being exported
  exportType: 'default' | 'named' | 'namespace';
  lineNumber?: number;
  statement: string;   // Original export statement
}

export interface CallRelation {
  from: string;        // Calling function/file
  to: string;          // Called function
  object?: string;     // Object/service being called (e.g., 'userService')
  lineNumber?: number;
  callType: 'direct' | 'method' | 'constructor' | 'async';
  context: string;     // Function/method context where call occurs
}

export interface InheritanceRelation {
  from: string;        // Child class
  to: string;          // Parent class/interface
  type: 'extends' | 'implements' | 'mixin';
  lineNumber?: number;
  interfaceName?: string;  // For interface implementations
}

export interface DependencyRelation {
  from: string;        // Dependent file
  to: string;          // Dependency (package or file)
  dependencyType: 'npm' | 'local' | 'builtin';
  version?: string;    // For npm dependencies
  usage: string[];     // How it's used
}

export interface CompositionRelation {
  from: string;        // Class that uses
  to: string;          // Class being used
  relationship: 'has-a' | 'uses' | 'aggregates';
  lineNumber?: number;
  fieldName?: string;  // Property name if composition
}

/**
 * Aggregate interface containing all relationships for a file
 */
export interface CodeRelationships {
  filePath: string;
  imports: ImportRelation[];
  exports: ExportRelation[];
  functionCalls: CallRelation[];
  classInheritance: InheritanceRelation[];
  dependencies: DependencyRelation[];
  compositions: CompositionRelation[];
  lastAnalyzed: Date;
}

/**
 * Related component information for query results
 */
export interface RelatedComponent {
  filePath: string;
  componentName: string;
  componentType: 'file' | 'class' | 'function' | 'interface' | 'module';
  relationshipType: RelationshipType;
  relationshipDescription: string;
  relevanceScore: number;  // 0.0 to 1.0
  distance: number;        // Graph distance from primary result
  snippet?: string;        // Code preview
}

/**
 * Relationship graph representation
 */
export interface RelationshipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  primaryNode: string;  // The main file being queried
  maxDepth: number;     // Maximum traversal depth
}

export interface GraphNode {
  id: string;           // File path or component identifier
  label: string;        // Display name
  type: 'file' | 'class' | 'function' | 'interface' | 'module';
  metadata: {
    biasScore?: number;
    complexity?: number;
    size?: number;
  };
}

export interface GraphEdge {
  from: string;         // Source node ID
  to: string;           // Target node ID
  type: RelationshipType;
  weight: number;       // Relationship strength 0.0 to 1.0
  label: string;        // Human-readable description
  metadata: {
    lineNumber?: number;
    symbols?: string[];
    bidirectional?: boolean;
  };
}

/**
 * All possible relationship types
 */
export type RelationshipType = 
  | 'imports'
  | 'exports' 
  | 'calls'
  | 'extends'
  | 'implements'
  | 'uses'
  | 'depends_on'
  | 'composes'
  | 'aggregates'
  | 'provides_service'
  | 'consumes_service';

/**
 * Relationship traversal configuration
 */
export interface RelationshipTraversalConfig {
  maxDepth: number;           // Maximum graph traversal depth
  relationshipTypes: RelationshipType[];  // Types to include
  minRelevanceScore: number;  // Minimum relevance threshold
  includeReverse: boolean;    // Include reverse relationships
  weightings: RelationshipWeights;  // Scoring weights
}

export interface RelationshipWeights {
  imports: number;      // Weight for import relationships
  exports: number;      // Weight for export relationships  
  calls: number;        // Weight for function calls
  extends: number;      // Weight for inheritance
  implements: number;   // Weight for interface implementation
  uses: number;         // Weight for composition/usage
  depends_on: number;   // Weight for dependencies
}

/**
 * Default relationship weights for scoring
 */
export const DEFAULT_RELATIONSHIP_WEIGHTS: RelationshipWeights = {
  imports: 1.0,      // Direct imports are highly relevant
  exports: 0.8,      // Exports are important but slightly less
  calls: 0.9,        // Function calls are very relevant
  extends: 0.95,     // Inheritance is very important
  implements: 0.9,   // Interface implementation is important
  uses: 0.7,         // Composition/usage relationships
  depends_on: 0.6    // External dependencies are less relevant
};

/**
 * Graph traversal result
 */
export interface GraphTraversalResult {
  startNode: string;
  relatedComponents: RelatedComponent[];
  relationshipGraph: RelationshipGraph;
  traversalStats: {
    nodesVisited: number;
    edgesTraversed: number;
    maxDepthReached: number;
    processingTime: number;
  };
}

/**
 * Relationship analysis statistics
 */
export interface RelationshipStats {
  totalFiles: number;
  totalRelationships: number;
  relationshipBreakdown: Record<RelationshipType, number>;
  averageConnectionsPerFile: number;
  mostConnectedFiles: Array<{
    filePath: string;
    connectionCount: number;
    relationshipTypes: RelationshipType[];
  }>;
  cyclicDependencies: Array<{
    cycle: string[];
    relationshipType: RelationshipType;
  }>;
}

/**
 * Context explanation for query results
 */
export interface ContextExplanation {
  primaryFile: string;
  contextSummary: string;
  keyRelationships: Array<{
    type: RelationshipType;
    description: string;
    importance: 'high' | 'medium' | 'low';
  }>;
  dependencyChain: string[];
  suggestedFiles: string[];
}

/**
 * File update with relationship impact
 */
export interface FileUpdateWithRelationships {
  filePath: string;
  changeType: 'created' | 'modified' | 'deleted';
  affectedRelationships: {
    broken: RelationshipType[];
    modified: RelationshipType[];
    created: RelationshipType[];
  };
  impactedFiles: string[];
  requiresReanalysis: string[];
}