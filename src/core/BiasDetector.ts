import { CodeRepresentation, BiasIndicator, CodeRegion } from '../types/index.js';

/**
 * TextualBiasDetector implements the bias detection algorithm from SACL paper
 * Detects over-reliance on surface-level textual features like docstrings and identifier names
 */
export class TextualBiasDetector {
  private biasIndicators = [
    'docstring_dependency',
    'identifier_name_bias', 
    'comment_over_reliance'
  ] as const;

  /**
   * Detect textual bias in code representation
   * Implements systematic masking approach from SACL methodology
   */
  async detectBias(code: CodeRepresentation, query?: string): Promise<number> {
    const maskedResults = await this.maskTextualFeatures(code);
    return this.calculateBiasScore(code, maskedResults);
  }

  /**
   * Systematic masking of textual features while preserving functionality
   * Key technique from SACL paper
   */
  private async maskTextualFeatures(code: CodeRepresentation): Promise<CodeRepresentation> {
    const masked: CodeRepresentation = {
      ...code,
      textualFeatures: {
        docstrings: [], // Mask docstrings
        comments: [], // Mask comments  
        identifierNames: code.textualFeatures.identifierNames.map(() => 'masked_id'), // Anonymize identifiers
        variableNames: code.textualFeatures.variableNames.map(() => 'var_x') // Anonymize variables
      }
    };

    return masked;
  }

  /**
   * Calculate bias score by comparing original vs masked representations
   * Higher score indicates more textual bias
   */
  private calculateBiasScore(original: CodeRepresentation, masked: CodeRepresentation): number {
    // Simulate semantic similarity between original and masked versions
    // In real implementation, this would use embedding similarity
    const structuralSimilarity = this.calculateStructuralSimilarity(original, masked);
    
    // If structural features are similar but we expect semantic degradation from masking,
    // high similarity indicates bias (over-reliance on text)
    const biasScore = 1.0 - structuralSimilarity;
    
    return Math.max(0, Math.min(1, biasScore));
  }

  /**
   * Calculate structural similarity between code representations
   */
  private calculateStructuralSimilarity(code1: CodeRepresentation, code2: CodeRepresentation): number {
    const struct1 = code1.structuralFeatures;
    const struct2 = code2.structuralFeatures;
    
    // Simple structural similarity based on AST metrics
    const similarities = [
      1 - Math.abs(struct1.complexity - struct2.complexity) / Math.max(struct1.complexity, struct2.complexity, 1),
      1 - Math.abs(struct1.nestingDepth - struct2.nestingDepth) / Math.max(struct1.nestingDepth, struct2.nestingDepth, 1),
      1 - Math.abs(struct1.functionCount - struct2.functionCount) / Math.max(struct1.functionCount, struct2.functionCount, 1),
      1 - Math.abs(struct1.classCount - struct2.classCount) / Math.max(struct1.classCount, struct2.classCount, 1)
    ];
    
    return similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
  }

  /**
   * Get detailed bias indicators for debugging and explanation
   */
  async getBiasIndicators(code: CodeRepresentation): Promise<BiasIndicator[]> {
    const indicators: BiasIndicator[] = [];
    
    // Check docstring dependency
    if (code.textualFeatures.docstrings.length > 0) {
      const docstringRatio = code.textualFeatures.docstrings.join('').length / code.content.length;
      if (docstringRatio > 0.1) { // Threshold for high docstring dependency
        indicators.push({
          type: 'docstring_dependency',
          severity: docstringRatio,
          location: this.findDocstringRegions(code),
          description: `High docstring dependency detected (${(docstringRatio * 100).toFixed(1)}% of code)`
        });
      }
    }
    
    // Check identifier name bias
    const identifierComplexity = this.calculateIdentifierComplexity(code.textualFeatures.identifierNames);
    if (identifierComplexity > 0.7) {
      indicators.push({
        type: 'identifier_name_bias',
        severity: identifierComplexity,
        location: { startLine: 1, endLine: code.content.split('\n').length, relevanceScore: 0.8, snippet: '' },
        description: `High reliance on descriptive identifier names detected`
      });
    }
    
    // Check comment over-reliance
    const commentRatio = code.textualFeatures.comments.join('').length / code.content.length;
    if (commentRatio > 0.15) {
      indicators.push({
        type: 'comment_over_reliance',
        severity: commentRatio,
        location: this.findCommentRegions(code),
        description: `Excessive reliance on comments detected (${(commentRatio * 100).toFixed(1)}% of code)`
      });
    }
    
    return indicators;
  }

  private findDocstringRegions(code: CodeRepresentation): CodeRegion {
    // Simplified: return entire file region
    // In real implementation, parse AST to find actual docstring locations
    return {
      startLine: 1,
      endLine: Math.min(10, code.content.split('\n').length),
      relevanceScore: 0.9,
      snippet: code.content.split('\n').slice(0, 10).join('\n')
    };
  }

  private findCommentRegions(code: CodeRepresentation): CodeRegion {
    const lines = code.content.split('\n');
    return {
      startLine: 1,
      endLine: lines.length,
      relevanceScore: 0.7,
      snippet: lines.filter(line => line.trim().startsWith('#') || line.trim().startsWith('//')).join('\n')
    };
  }

  private calculateIdentifierComplexity(identifiers: string[]): number {
    if (identifiers.length === 0) return 0;
    
    const avgLength = identifiers.reduce((sum, id) => sum + id.length, 0) / identifiers.length;
    const descriptiveWords = identifiers.filter(id => 
      id.includes('_') || /[A-Z]/.test(id) || id.length > 8
    ).length;
    
    return (avgLength / 20 + descriptiveWords / identifiers.length) / 2;
  }
}