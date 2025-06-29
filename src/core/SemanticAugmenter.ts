import { CodeRepresentation } from '../types/index.js';
import OpenAI from 'openai';

/**
 * SemanticAugmenter implements Stage 1 of SACL framework
 * Enriches code representations with semantic information beyond surface-level features
 */
export class SemanticAugmenter {
  private openai: OpenAI;
  private codeEncoder: CodeEncoder;
  private semanticEmbedder: SemanticEmbedder;

  constructor(apiKey: string, model: string = 'gpt-4') {
    this.openai = new OpenAI({ apiKey });
    this.codeEncoder = new CodeEncoder(this.openai, model);
    this.semanticEmbedder = new SemanticEmbedder(this.openai);
  }

  /**
   * Augment code representation with semantic information
   * Combines base embeddings with semantic understanding to reduce textual bias
   */
  async augmentRepresentation(code: CodeRepresentation): Promise<CodeRepresentation> {
    // Generate base code embedding
    const baseEmbedding = await this.codeEncoder.encode(code.content);
    
    // Generate semantic embedding focusing on functionality
    const semanticEmbedding = await this.semanticEmbedder.embed(code);
    
    // Generate functional signature and behavior pattern
    const { functionalSignature, behaviorPattern } = await this.extractSemanticFeatures(code);
    
    // Combine embeddings to create augmented representation
    const augmentedEmbedding = this.combineEmbeddings(baseEmbedding, semanticEmbedding);
    
    return {
      ...code,
      semanticFeatures: {
        embedding: semanticEmbedding,
        functionalSignature,
        behaviorPattern
      },
      augmentedEmbedding
    };
  }

  /**
   * Extract high-level semantic features using LLM analysis
   */
  private async extractSemanticFeatures(code: CodeRepresentation): Promise<{
    functionalSignature: string;
    behaviorPattern: string;
  }> {
    const prompt = `Analyze this code and extract semantic features, ignoring variable names and comments:

CODE:
${code.content}

Provide:
1. Functional signature: What does this code DO functionally (inputs/outputs/transformations)
2. Behavior pattern: What computational pattern does it follow (iteration, recursion, filtering, etc.)

Focus on FUNCTIONALITY, not naming or documentation.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.1
      });

      const content = response.choices[0]?.message?.content || '';
      const lines = content.split('\n');
      
      const functionalSignature = lines.find(line => 
        line.toLowerCase().includes('functional') || line.includes('1.')
      )?.replace(/^[1-9\.]?\s*/, '') || 'Unknown function signature';
      
      const behaviorPattern = lines.find(line => 
        line.toLowerCase().includes('behavior') || line.includes('2.')
      )?.replace(/^[1-9\.]?\s*/, '') || 'Unknown behavior pattern';
      
      return { functionalSignature, behaviorPattern };
    } catch (error) {
      console.error('Error extracting semantic features:', error);
      return {
        functionalSignature: 'Error analyzing function signature',
        behaviorPattern: 'Error analyzing behavior pattern'
      };
    }
  }

  /**
   * Combine base and semantic embeddings using weighted combination
   * Reduces textual bias by emphasizing semantic over surface features
   */
  private combineEmbeddings(baseEmbedding: number[], semanticEmbedding: number[]): number[] {
    const maxLength = Math.max(baseEmbedding.length, semanticEmbedding.length);
    const combined: number[] = [];
    
    // Weight semantic features higher to reduce textual bias
    const semanticWeight = 0.7;
    const baseWeight = 0.3;
    
    for (let i = 0; i < maxLength; i++) {
      const base = baseEmbedding[i] || 0;
      const semantic = semanticEmbedding[i] || 0;
      combined[i] = (base * baseWeight) + (semantic * semanticWeight);
    }
    
    return combined;
  }

  /**
   * Generate explanation for the semantic augmentation process
   */
  async generateExplanation(original: CodeRepresentation, augmented: CodeRepresentation): Promise<string> {
    const prompt = `Explain how this code's semantic understanding has been enhanced:

ORIGINAL FEATURES:
- Docstrings: ${original.textualFeatures.docstrings.length}
- Comments: ${original.textualFeatures.comments.length} 
- Identifiers: ${original.textualFeatures.identifierNames.length}

SEMANTIC FEATURES:
- Functional Signature: ${augmented.semanticFeatures.functionalSignature}
- Behavior Pattern: ${augmented.semanticFeatures.behaviorPattern}
- Bias Score: ${augmented.biasScore.toFixed(3)}

Provide a concise explanation of how semantic augmentation improves code understanding beyond surface-level text.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.2
      });

      return response.choices[0]?.message?.content || 'Semantic augmentation explanation unavailable';
    } catch (error) {
      console.error('Error generating explanation:', error);
      return 'Error generating semantic augmentation explanation';
    }
  }
}

/**
 * CodeEncoder handles basic code embedding generation
 */
class CodeEncoder {
  constructor(private openai: OpenAI, private model: string) {}

  async encode(codeContent: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: codeContent
      });

      return response.data[0]?.embedding || [];
    } catch (error) {
      console.error('Error generating code embedding:', error);
      return [];
    }
  }
}

/**
 * SemanticEmbedder focuses on functional/semantic aspects
 */
class SemanticEmbedder {
  constructor(private openai: OpenAI) {}

  async embed(code: CodeRepresentation): Promise<number[]> {
    // Create semantic-focused representation by emphasizing structural features
    const semanticContent = this.createSemanticRepresentation(code);
    
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: semanticContent
      });

      return response.data[0]?.embedding || [];
    } catch (error) {
      console.error('Error generating semantic embedding:', error);
      return [];
    }
  }

  /**
   * Create a textual representation emphasizing semantic/structural aspects
   */
  private createSemanticRepresentation(code: CodeRepresentation): string {
    const struct = code.structuralFeatures;
    
    return `
    Computational structure: ${struct.complexity} complexity, ${struct.nestingDepth} nesting levels
    Components: ${struct.functionCount} functions, ${struct.classCount} classes
    AST nodes: ${struct.astNodes}
    Code patterns: ${code.semanticFeatures?.behaviorPattern || 'unknown'}
    Functional signature: ${code.semanticFeatures?.functionalSignature || 'unknown'}
    `.trim();
  }
}