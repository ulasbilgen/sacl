import { 
  CodeRepresentation, 
  RetrievalResult, 
  EnhancedRetrievalResult,
  CodeRegion,
  RelatedComponent,
  RelationshipGraph,
  ContextExplanation
} from '../types/index.js';
import { GraphitiClient } from '../graphiti/GraphitiClient.js';

/**
 * SACLReranker implements Stage 2 of SACL framework
 * Reranks retrieval results using semantic signals and localizes relevant code segments
 */
export class SACLReranker {
  private similarityCalculator: SemanticSimilarityCalculator;
  private relevanceScorer: FunctionalRelevanceScorer;
  private localizer: CodeLocalizer;
  private graphitiClient?: GraphitiClient;

  constructor(graphitiClient?: GraphitiClient) {
    this.similarityCalculator = new SemanticSimilarityCalculator();
    this.relevanceScorer = new FunctionalRelevanceScorer();
    this.localizer = new CodeLocalizer();
    this.graphitiClient = graphitiClient;
  }

  /**
   * Enhanced reranking with relationship context (NEW - Phase 5)
   * Returns enhanced results with related components
   */
  async rerankWithContext(
    initialResults: CodeRepresentation[], 
    query: string, 
    topK: number = 10
  ): Promise<EnhancedRetrievalResult[]> {
    if (!this.graphitiClient) {
      // Fallback to basic reranking if no GraphitiClient
      const basicResults = await this.rerank(initialResults, query, topK);
      return basicResults.map(result => this.convertToEnhanced(result));
    }

    const enhancedResults: EnhancedRetrievalResult[] = [];

    for (const result of initialResults) {
      // Get basic scores
      const textualSim = await this.calculateTextualSimilarity(result, query);
      const semanticSim = await this.similarityCalculator.calculate(result, query);
      const functionalSim = await this.relevanceScorer.score(result, query);
      const finalScore = this.combineScores(textualSim, semanticSim, functionalSim, result.biasScore);
      const localizationRegions = await this.localizer.localize(result, query);

      // Get relationship context (NEW)
      const relatedComponents = await this.graphitiClient.getRelatedComponents(result.filePath, { maxDepth: 2 });
      const relationshipGraph = await this.createRelationshipGraph(result.filePath, relatedComponents);
      const contextExplanation = this.generateContextExplanation(result, relatedComponents, query);

      // Enhanced explanation including relationships
      const explanation = this.generateEnhancedExplanation(
        result, query, textualSim, semanticSim, functionalSim, finalScore, relatedComponents
      );

      enhancedResults.push({
        codeSnippet: result,
        originalScore: textualSim,
        semanticScore: semanticSim,
        biasAdjustedScore: finalScore,
        localizationRegions,
        explanation,
        relatedComponents,
        relationshipGraph,
        contextExplanation,
        dependencyChain: this.buildDependencyChain(result.filePath, relatedComponents)
      });
    }

    // Sort by bias-adjusted score and return top results
    return enhancedResults
      .sort((a, b) => b.biasAdjustedScore - a.biasAdjustedScore)
      .slice(0, topK);
  }

  /**
   * Rerank initial results using SACL methodology
   * Combines multiple similarity metrics to reduce textual bias
   */
  async rerank(
    initialResults: CodeRepresentation[], 
    query: string, 
    topK: number = 10
  ): Promise<RetrievalResult[]> {
    const scoredResults: RetrievalResult[] = [];

    for (const result of initialResults) {
      // Calculate multiple similarity scores
      const textualSim = await this.calculateTextualSimilarity(result, query);
      const semanticSim = await this.similarityCalculator.calculate(result, query);
      const functionalSim = await this.relevanceScorer.score(result, query);

      // Weighted combination to reduce textual bias
      const finalScore = this.combineScores(textualSim, semanticSim, functionalSim, result.biasScore);

      // Localize relevant code regions
      const localizationRegions = await this.localizer.localize(result, query);

      // Generate explanation for the ranking decision
      const explanation = this.generateRankingExplanation(
        result, query, textualSim, semanticSim, functionalSim, finalScore
      );

      scoredResults.push({
        codeSnippet: result,
        originalScore: textualSim,
        semanticScore: semanticSim,
        biasAdjustedScore: finalScore,
        localizationRegions,
        explanation
      });
    }

    // Sort by bias-adjusted score and return top results
    return scoredResults
      .sort((a, b) => b.biasAdjustedScore - a.biasAdjustedScore)
      .slice(0, topK);
  }

  /**
   * Calculate textual similarity (baseline approach)
   */
  private async calculateTextualSimilarity(code: CodeRepresentation, query: string): Promise<number> {
    // Simple textual similarity based on keyword matching
    const queryTokens = query.toLowerCase().split(/\s+/);
    const codeText = [
      ...code.textualFeatures.docstrings,
      ...code.textualFeatures.comments,
      ...code.textualFeatures.identifierNames,
      code.content
    ].join(' ').toLowerCase();

    const matches = queryTokens.filter(token => codeText.includes(token)).length;
    return matches / queryTokens.length;
  }

  /**
   * Combine multiple similarity scores with bias adjustment
   * Implements bias-aware ranking from SACL paper
   */
  private combineScores(
    textualSim: number,
    semanticSim: number, 
    functionalSim: number,
    biasScore: number
  ): number {
    // Reduce weight of textual similarity based on bias score
    const biasAdjustment = 1.0 - (biasScore * 0.5); // Higher bias = lower textual weight
    const textualWeight = 0.2 * biasAdjustment;
    const semanticWeight = 0.5;
    const functionalWeight = 0.3;

    const normalizedWeights = textualWeight + semanticWeight + functionalWeight;
    
    return (
      (textualSim * textualWeight) +
      (semanticSim * semanticWeight) + 
      (functionalSim * functionalWeight)
    ) / normalizedWeights;
  }

  /**
   * Generate explanation for ranking decision (for debugging/transparency)
   */
  private generateRankingExplanation(
    code: CodeRepresentation,
    query: string,
    textualSim: number,
    semanticSim: number,
    functionalSim: number,
    finalScore: number
  ): string {
    const biasLevel = code.biasScore > 0.7 ? 'High' : code.biasScore > 0.4 ? 'Medium' : 'Low';
    
    return `SACL Ranking Analysis:
• Query: "${query}"
• Textual Similarity: ${(textualSim * 100).toFixed(1)}%
• Semantic Similarity: ${(semanticSim * 100).toFixed(1)}%
• Functional Relevance: ${(functionalSim * 100).toFixed(1)}%
• Bias Level: ${biasLevel} (${(code.biasScore * 100).toFixed(1)}%)
• Final Score: ${(finalScore * 100).toFixed(1)}%
• Bias Adjustment: ${code.biasScore > 0.4 ? 'Applied - reduced textual weight' : 'Minimal'}
• Key Features: ${code.semanticFeatures.behaviorPattern}`;
  }

  // ================================
  // ENHANCED CONTEXT METHODS (Phase 5)
  // ================================

  /**
   * Convert basic RetrievalResult to EnhancedRetrievalResult (fallback)
   */
  private convertToEnhanced(result: RetrievalResult): EnhancedRetrievalResult {
    return {
      ...result,
      relatedComponents: [],
      relationshipGraph: {
        nodes: [],
        edges: [],
        primaryNode: result.codeSnippet.filePath,
        maxDepth: 0
      },
      contextExplanation: {
        primaryFile: result.codeSnippet.filePath,
        contextSummary: 'No relationship context available',
        keyRelationships: [],
        dependencyChain: [],
        suggestedFiles: []
      },
      dependencyChain: []
    };
  }

  /**
   * Create relationship graph for visualization
   */
  private async createRelationshipGraph(filePath: string, relatedComponents: RelatedComponent[]): Promise<RelationshipGraph> {
    return {
      nodes: [
        {
          id: filePath,
          label: filePath.split('/').pop() || filePath,
          type: 'file',
          metadata: { complexity: 5 }
        },
        ...relatedComponents.slice(0, 5).map(comp => ({
          id: comp.filePath,
          label: comp.componentName,
          type: comp.componentType,
          metadata: { biasScore: 0.4 }
        }))
      ],
      edges: relatedComponents.slice(0, 5).map(comp => ({
        from: filePath,
        to: comp.filePath,
        type: comp.relationshipType,
        weight: comp.relevanceScore,
        label: comp.relationshipDescription,
        metadata: { bidirectional: false }
      })),
      primaryNode: filePath,
      maxDepth: Math.max(...relatedComponents.map(c => c.distance), 1)
    };
  }

  /**
   * Generate context explanation for the results
   */
  private generateContextExplanation(
    code: CodeRepresentation, 
    relatedComponents: RelatedComponent[], 
    query: string
  ): ContextExplanation {
    const topRelated = relatedComponents.slice(0, 3);
    const keyRelationships = topRelated.map(comp => ({
      type: comp.relationshipType,
      description: comp.relationshipDescription,
      importance: comp.relevanceScore > 0.8 ? 'high' as const : 
                  comp.relevanceScore > 0.5 ? 'medium' as const : 'low' as const
    }));

    return {
      primaryFile: code.filePath,
      contextSummary: this.buildContextSummary(code, topRelated, query),
      keyRelationships,
      dependencyChain: this.buildDependencyChain(code.filePath, relatedComponents),
      suggestedFiles: topRelated.map(comp => comp.filePath)
    };
  }

  /**
   * Generate enhanced explanation including relationship context
   */
  private generateEnhancedExplanation(
    code: CodeRepresentation,
    query: string,
    textualSim: number,
    semanticSim: number,
    functionalSim: number,
    finalScore: number,
    relatedComponents: RelatedComponent[]
  ): string {
    const basicExplanation = this.generateRankingExplanation(
      code, query, textualSim, semanticSim, functionalSim, finalScore
    );

    const contextInfo = relatedComponents.length > 0 ? `

🔗 Relationship Context:
• Related Components: ${relatedComponents.length}
• Key Relationships: ${relatedComponents.slice(0, 3).map(c => c.relationshipDescription).join(', ')}
• Context Relevance: ${relatedComponents.length > 0 ? 'High' : 'Low'}` : '\n\n🔗 No relationship context available';

    return basicExplanation + contextInfo;
  }

  /**
   * Build context summary
   */
  private buildContextSummary(
    code: CodeRepresentation, 
    relatedComponents: RelatedComponent[], 
    query: string
  ): string {
    if (relatedComponents.length === 0) {
      return `${code.filePath} is a standalone component with no significant relationships detected.`;
    }

    const importCount = relatedComponents.filter(c => c.relationshipType === 'imports').length;
    const callCount = relatedComponents.filter(c => c.relationshipType === 'calls').length;
    const inheritanceCount = relatedComponents.filter(c => 
      ['extends', 'implements'].includes(c.relationshipType)
    ).length;

    return `${code.filePath} has ${relatedComponents.length} related components including ${importCount} imports, ${callCount} function calls, and ${inheritanceCount} inheritance relationships. Most relevant for "${query}": ${relatedComponents[0]?.relationshipDescription || 'none'}.`;
  }

  /**
   * Build dependency chain
   */
  private buildDependencyChain(filePath: string, relatedComponents: RelatedComponent[]): string[] {
    const chain = [filePath];
    
    // Add immediate dependencies
    const dependencies = relatedComponents
      .filter(c => ['imports', 'depends_on'].includes(c.relationshipType))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 3)
      .map(c => c.filePath);
    
    chain.push(...dependencies);
    return chain;
  }
}

/**
 * Calculates semantic similarity using embeddings
 */
class SemanticSimilarityCalculator {
  async calculate(code: CodeRepresentation, query: string): Promise<number> {
    // Use augmented embedding for better semantic understanding
    const codeEmbedding = code.augmentedEmbedding;
    
    // In a real implementation, we'd generate query embedding and compute cosine similarity
    // For now, simulate based on semantic features
    const queryTokens = query.toLowerCase().split(/\s+/);
    const semanticContent = [
      code.semanticFeatures.functionalSignature,
      code.semanticFeatures.behaviorPattern
    ].join(' ').toLowerCase();

    const semanticMatches = queryTokens.filter(token => 
      semanticContent.includes(token) || 
      this.findSemanticRelated(token, semanticContent)
    ).length;

    return Math.min(1.0, semanticMatches / queryTokens.length * 1.2); // Boost semantic matches
  }

  private findSemanticRelated(token: string, content: string): boolean {
    // Simple semantic relationship detection
    const relationships = {
      'sort': ['order', 'arrange', 'sequence'],
      'search': ['find', 'locate', 'query', 'filter'],
      'transform': ['convert', 'change', 'modify', 'map'],
      'iterate': ['loop', 'traverse', 'process', 'each'],
      'validate': ['check', 'verify', 'ensure', 'test']
    };

    for (const [key, synonyms] of Object.entries(relationships)) {
      if (token === key && synonyms.some(syn => content.includes(syn))) {
        return true;
      }
      if (synonyms.includes(token) && content.includes(key)) {
        return true;
      }
    }

    return false;
  }
}

/**
 * Scores functional relevance beyond textual similarity
 */
class FunctionalRelevanceScorer {
  async score(code: CodeRepresentation, query: string): Promise<number> {
    // Analyze structural complexity alignment with query intent
    const queryComplexity = this.estimateQueryComplexity(query);
    const codeComplexity = code.structuralFeatures.complexity;
    
    // Prefer code with appropriate complexity for the query
    const complexityScore = 1.0 - Math.abs(queryComplexity - codeComplexity) / Math.max(queryComplexity, codeComplexity, 1);
    
    // Consider behavioral pattern match
    const behaviorScore = this.scoreBehaviorAlignment(query, code.semanticFeatures.behaviorPattern);
    
    return (complexityScore * 0.4) + (behaviorScore * 0.6);
  }

  private estimateQueryComplexity(query: string): number {
    const complexityKeywords = {
      'simple': 1, 'basic': 1, 'easy': 1,
      'complex': 5, 'advanced': 5, 'sophisticated': 5,
      'algorithm': 4, 'optimize': 4, 'efficient': 4,
      'recursive': 6, 'dynamic': 5, 'parallel': 6
    };

    const tokens = query.toLowerCase().split(/\s+/);
    const scores = tokens.map(token => complexityKeywords[token] || 3);
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  private scoreBehaviorAlignment(query: string, behaviorPattern: string): number {
    const queryLower = query.toLowerCase();
    const patternLower = behaviorPattern.toLowerCase();
    
    // Direct pattern matching
    if (patternLower.includes(queryLower) || queryLower.includes(patternLower)) {
      return 1.0;
    }
    
    // Behavioral keyword matching
    const behaviorKeywords = [
      'iteration', 'recursion', 'filtering', 'mapping', 'sorting',
      'searching', 'optimization', 'validation', 'transformation'
    ];
    
    const queryBehaviors = behaviorKeywords.filter(kw => queryLower.includes(kw));
    const patternBehaviors = behaviorKeywords.filter(kw => patternLower.includes(kw));
    
    const overlap = queryBehaviors.filter(qb => patternBehaviors.includes(qb)).length;
    const total = Math.max(queryBehaviors.length, patternBehaviors.length, 1);
    
    return overlap / total;
  }
}

/**
 * Localizes functionally relevant code segments
 */
class CodeLocalizer {
  async localize(code: CodeRepresentation, query: string): Promise<CodeRegion[]> {
    const lines = code.content.split('\n');
    const regions: CodeRegion[] = [];
    
    // Find function definitions and significant code blocks
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect function/method definitions
      if (/^\s*(def|function|class|async|public|private)\s+/.test(line)) {
        const endLine = this.findBlockEnd(lines, i);
        const snippet = lines.slice(i, endLine + 1).join('\n');
        const relevanceScore = this.scoreRelevance(snippet, query);
        
        if (relevanceScore > 0.3) {
          regions.push({
            startLine: i + 1,
            endLine: endLine + 1,
            relevanceScore,
            snippet: snippet.slice(0, 200) + (snippet.length > 200 ? '...' : '')
          });
        }
      }
    }
    
    // Sort by relevance and return top regions
    return regions.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 3);
  }

  private findBlockEnd(lines: string[], startLine: number): number {
    const startIndent = lines[startLine].match(/^\s*/)?.[0].length || 0;
    
    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') continue;
      
      const indent = lines[i].match(/^\s*/)?.[0].length || 0;
      if (indent <= startIndent && line.length > 0) {
        return i - 1;
      }
    }
    
    return lines.length - 1;
  }

  private scoreRelevance(snippet: string, query: string): number {
    const queryTokens = query.toLowerCase().split(/\s+/);
    const snippetLower = snippet.toLowerCase();
    
    const matches = queryTokens.filter(token => snippetLower.includes(token)).length;
    return matches / queryTokens.length;
  }
}