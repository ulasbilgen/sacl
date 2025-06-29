import { readFile } from 'fs/promises';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { glob } from 'glob';
import { 
  CodeRepresentation, 
  CodeRelationships,
  ImportRelation,
  ExportRelation,
  CallRelation,
  InheritanceRelation,
  DependencyRelation
} from '../types/index.js';
import path from 'path';

/**
 * CodeAnalyzer extracts structural and textual features from code files
 * Supports multiple programming languages through AST analysis
 */
export class CodeAnalyzer {
  private supportedExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs'
  ];

  /**
   * Find all code files in repository
   */
  async findCodeFiles(repositoryPath: string): Promise<string[]> {
    try {
      const patterns = this.supportedExtensions.map(ext => 
        path.join(repositoryPath, '**', `*${ext}`)
      );
      
      const allFiles: string[] = [];
      
      for (const pattern of patterns) {
        const files = await glob(pattern, {
          ignore: [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/.git/**',
            '**/coverage/**',
            '**/*.test.*',
            '**/*.spec.*'
          ]
        });
        allFiles.push(...files);
      }
      
      // Remove duplicates and sort
      return [...new Set(allFiles)].sort();
      
    } catch (error) {
      console.error('Error finding code files:', error);
      return [];
    }
  }

  /**
   * Analyze single file and extract features
   */
  async analyzeFile(filePath: string): Promise<CodeRepresentation | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const extension = path.extname(filePath);
      
      // Extract textual features
      const textualFeatures = this.extractTextualFeatures(content, extension);
      
      // Extract structural features
      const structuralFeatures = await this.extractStructuralFeatures(content, extension);
      
      // Extract relationships (NEW)
      const relationships = await this.extractRelationships(content, filePath, extension);
      
      const codeRep: CodeRepresentation = {
        filePath,
        content,
        textualFeatures,
        structuralFeatures,
        semanticFeatures: {
          embedding: [],
          functionalSignature: '',
          behaviorPattern: ''
        },
        relationships,  // NEW: Include relationships
        biasScore: 0,
        augmentedEmbedding: [],
        lastModified: new Date()
      };
      
      return codeRep;
      
    } catch (error) {
      console.error(`Error analyzing file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Extract textual features (comments, docstrings, identifiers)
   */
  private extractTextualFeatures(content: string, extension: string): any {
    const lines = content.split('\n');
    const features = {
      docstrings: [] as string[],
      comments: [] as string[],
      identifierNames: [] as string[],
      variableNames: [] as string[]
    };

    // Extract comments based on language
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Single-line comments
      if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
        features.comments.push(trimmed);
      }
      
      // Multi-line comments (simplified)
      if (trimmed.includes('/*') || trimmed.includes('"""') || trimmed.includes("'''")) {
        features.comments.push(trimmed);
      }
    }

    // Extract identifiers and variables using regex patterns
    const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    const matches = content.match(identifierPattern) || [];
    
    // Filter and categorize identifiers
    const uniqueIdentifiers = [...new Set(matches)];
    features.identifierNames = uniqueIdentifiers.filter(id => 
      id.length > 2 && !this.isKeyword(id, extension)
    );

    // Extract potential variable names (simplified heuristic)
    features.variableNames = features.identifierNames.filter(id =>
      /^[a-z]/.test(id) && !id.includes('function') && !id.includes('class')
    );

    return features;
  }

  /**
   * Extract structural features using AST analysis
   */
  private async extractStructuralFeatures(content: string, extension: string): Promise<any> {
    const features = {
      astNodes: 0,
      complexity: 1, // Start with 1 for base complexity
      nestingDepth: 0,
      functionCount: 0,
      classCount: 0
    };

    try {
      // Try to parse with Babel for JavaScript/TypeScript
      if (['.js', '.jsx', '.ts', '.tsx'].includes(extension)) {
        const ast = parse(content, {
          sourceType: 'module',
          allowImportExportEverywhere: true,
          allowAwaitOutsideFunction: true,
          plugins: [
            'jsx',
            'typescript',
            'decorators-legacy',
            'classProperties',
            'objectRestSpread',
            'asyncGenerators',
            'optionalChaining',
            'nullishCoalescingOperator'
          ]
        });

        // Traverse AST and count features
        let currentDepth = 0;
        let maxDepth = 0;

        traverse(ast, {
          enter(path) {
            features.astNodes++;
            currentDepth++;
            maxDepth = Math.max(maxDepth, currentDepth);

            // Count complexity-contributing nodes
            if (
              path.isIfStatement() ||
              path.isWhileStatement() ||
              path.isForStatement() ||
              path.isSwitchCase() ||
              path.isConditionalExpression() ||
              path.isLogicalExpression()
            ) {
              features.complexity++;
            }

            // Count functions
            if (
              path.isFunctionDeclaration() ||
              path.isFunctionExpression() ||
              path.isArrowFunctionExpression() ||
              path.isMethodDefinition()
            ) {
              features.functionCount++;
            }

            // Count classes
            if (path.isClassDeclaration()) {
              features.classCount++;
            }
          },
          exit() {
            currentDepth--;
          }
        });

        features.nestingDepth = maxDepth;
      } else {
        // For non-JS languages, use simpler heuristics
        features = this.extractStructuralHeuristics(content);
      }

    } catch (error) {
      // Fallback to heuristic analysis if AST parsing fails
      console.warn(`AST parsing failed for ${extension}, using heuristics`);
      features = this.extractStructuralHeuristics(content);
    }

    return features;
  }

  /**
   * Extract structural features using heuristics (fallback method)
   */
  private extractStructuralHeuristics(content: string): any {
    const lines = content.split('\n');
    const features = {
      astNodes: lines.length * 2, // Rough estimate
      complexity: 1,
      nestingDepth: 0,
      functionCount: 0,
      classCount: 0
    };

    let currentIndent = 0;
    let maxIndent = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;
      
      currentIndent = Math.floor(indent / 2); // Assume 2-space indentation
      maxIndent = Math.max(maxIndent, currentIndent);

      // Count complexity keywords
      const complexityKeywords = ['if', 'while', 'for', 'switch', 'case', 'catch', '&&', '||', '?'];
      for (const keyword of complexityKeywords) {
        if (trimmed.includes(keyword)) {
          features.complexity++;
        }
      }

      // Count functions (various languages)
      const functionKeywords = ['def ', 'function ', 'func ', 'public ', 'private ', 'protected '];
      for (const keyword of functionKeywords) {
        if (trimmed.startsWith(keyword) || trimmed.includes(keyword + ' ')) {
          features.functionCount++;
        }
      }

      // Count classes
      const classKeywords = ['class ', 'interface ', 'struct '];
      for (const keyword of classKeywords) {
        if (trimmed.startsWith(keyword)) {
          features.classCount++;
        }
      }
    }

    features.nestingDepth = maxIndent;
    return features;
  }

  /**
   * Check if identifier is a language keyword
   */
  private isKeyword(identifier: string, extension: string): boolean {
    const keywords = {
      '.js': ['var', 'let', 'const', 'function', 'if', 'else', 'for', 'while', 'return', 'class', 'import', 'export'],
      '.ts': ['var', 'let', 'const', 'function', 'if', 'else', 'for', 'while', 'return', 'class', 'import', 'export', 'interface', 'type'],
      '.py': ['def', 'class', 'if', 'else', 'for', 'while', 'return', 'import', 'from', 'try', 'except'],
      '.java': ['public', 'private', 'class', 'interface', 'if', 'else', 'for', 'while', 'return', 'import'],
      '.cpp': ['int', 'void', 'class', 'if', 'else', 'for', 'while', 'return', 'include', 'namespace'],
    };

    const langKeywords = keywords[extension as keyof typeof keywords] || [];
    return langKeywords.includes(identifier.toLowerCase());
  }

  // ================================
  // RELATIONSHIP EXTRACTION METHODS
  // ================================

  /**
   * Extract all relationships from code content
   */
  async extractRelationships(content: string, filePath: string, extension: string): Promise<CodeRelationships> {
    const relationships: CodeRelationships = {
      filePath,
      imports: [],
      exports: [],
      functionCalls: [],
      classInheritance: [],
      dependencies: [],
      compositions: [],
      lastAnalyzed: new Date()
    };

    try {
      if (['.js', '.jsx', '.ts', '.tsx'].includes(extension)) {
        // JavaScript/TypeScript analysis using AST
        await this.extractJavaScriptRelationships(content, filePath, relationships);
      } else if (extension === '.py') {
        // Python analysis using regex and heuristics
        await this.extractPythonRelationships(content, filePath, relationships);
      } else {
        // Generic analysis for other languages
        await this.extractGenericRelationships(content, filePath, relationships);
      }

      console.log(`Extracted relationships for ${filePath}: ${relationships.imports.length} imports, ${relationships.functionCalls.length} calls`);
      
    } catch (error) {
      console.error(`Error extracting relationships from ${filePath}:`, error);
    }

    return relationships;
  }

  /**
   * Extract relationships from JavaScript/TypeScript using AST
   */
  private async extractJavaScriptRelationships(
    content: string, 
    filePath: string, 
    relationships: CodeRelationships
  ): Promise<void> {
    try {
      const ast = parse(content, {
        sourceType: 'module',
        allowImportExportEverywhere: true,
        allowAwaitOutsideFunction: true,
        plugins: [
          'jsx',
          'typescript', 
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'optionalChaining',
          'nullishCoalescingOperator'
        ]
      });

      traverse(ast, {
        // Extract import statements
        ImportDeclaration: (path) => {
          const importPath = path.node.source.value;
          const symbols: string[] = [];
          let importType: 'default' | 'named' | 'namespace' | 'dynamic' = 'named';

          path.node.specifiers.forEach(spec => {
            if (t.isImportDefaultSpecifier(spec)) {
              symbols.push(spec.local.name);
              importType = 'default';
            } else if (t.isImportSpecifier(spec)) {
              symbols.push(spec.imported.type === 'Identifier' ? spec.imported.name : 'unknown');
            } else if (t.isImportNamespaceSpecifier(spec)) {
              symbols.push(spec.local.name);
              importType = 'namespace';
            }
          });

          relationships.imports.push({
            from: filePath,
            to: this.resolveImportPath(importPath, filePath),
            symbols,
            importType,
            lineNumber: path.node.loc?.start.line,
            statement: content.split('\n')[path.node.loc?.start.line! - 1] || ''
          });
        },

        // Extract export statements
        ExportNamedDeclaration: (path) => {
          if (path.node.declaration) {
            if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
              relationships.exports.push({
                from: filePath,
                symbol: path.node.declaration.id.name,
                exportType: 'named',
                lineNumber: path.node.loc?.start.line,
                statement: content.split('\n')[path.node.loc?.start.line! - 1] || ''
              });
            } else if (t.isVariableDeclaration(path.node.declaration)) {
              path.node.declaration.declarations.forEach(decl => {
                if (t.isIdentifier(decl.id)) {
                  relationships.exports.push({
                    from: filePath,
                    symbol: decl.id.name,
                    exportType: 'named',
                    lineNumber: path.node.loc?.start.line,
                    statement: content.split('\n')[path.node.loc?.start.line! - 1] || ''
                  });
                }
              });
            }
          }
        },

        // Extract default exports
        ExportDefaultDeclaration: (path) => {
          let symbolName = 'default';
          if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
            symbolName = path.node.declaration.id.name;
          } else if (t.isClassDeclaration(path.node.declaration) && path.node.declaration.id) {
            symbolName = path.node.declaration.id.name;
          }

          relationships.exports.push({
            from: filePath,
            symbol: symbolName,
            exportType: 'default',
            lineNumber: path.node.loc?.start.line,
            statement: content.split('\n')[path.node.loc?.start.line! - 1] || ''
          });
        },

        // Extract class inheritance
        ClassDeclaration: (path) => {
          if (path.node.superClass && t.isIdentifier(path.node.superClass) && path.node.id) {
            relationships.classInheritance.push({
              from: path.node.id.name,
              to: path.node.superClass.name,
              type: 'extends',
              lineNumber: path.node.loc?.start.line
            });
          }

          // Extract implemented interfaces (TypeScript)
          if ('implements' in path.node && path.node.implements) {
            path.node.implements.forEach((impl: any) => {
              if (t.isIdentifier(impl.expression) && path.node.id) {
                relationships.classInheritance.push({
                  from: path.node.id.name,
                  to: impl.expression.name,
                  type: 'implements',
                  lineNumber: path.node.loc?.start.line,
                  interfaceName: impl.expression.name
                });
              }
            });
          }
        },

        // Extract function calls
        CallExpression: (path) => {
          let functionName = '';
          let objectName = '';

          if (t.isIdentifier(path.node.callee)) {
            functionName = path.node.callee.name;
          } else if (t.isMemberExpression(path.node.callee)) {
            if (t.isIdentifier(path.node.callee.object)) {
              objectName = path.node.callee.object.name;
            }
            if (t.isIdentifier(path.node.callee.property)) {
              functionName = path.node.callee.property.name;
            }
          }

          if (functionName) {
            relationships.functionCalls.push({
              from: filePath,
              to: functionName,
              object: objectName || undefined,
              lineNumber: path.node.loc?.start.line,
              callType: 'direct', // Could be enhanced to detect method vs direct calls
              context: this.findContainingFunction(path) || 'global'
            });
          }
        }
      });

    } catch (error) {
      console.error('Error in JavaScript AST analysis:', error);
    }
  }

  /**
   * Extract relationships from Python using regex patterns
   */
  private async extractPythonRelationships(
    content: string, 
    filePath: string, 
    relationships: CodeRelationships
  ): Promise<void> {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Extract import statements
      const importMatch = line.match(/^import\s+(.+)/);
      if (importMatch) {
        const modules = importMatch[1].split(',').map(m => m.trim());
        modules.forEach(module => {
          relationships.imports.push({
            from: filePath,
            to: module,
            symbols: [module],
            importType: 'named',
            lineNumber,
            statement: line
          });
        });
      }

      // Extract from imports
      const fromImportMatch = line.match(/^from\s+([^\s]+)\s+import\s+(.+)/);
      if (fromImportMatch) {
        const module = fromImportMatch[1];
        const symbols = fromImportMatch[2].split(',').map(s => s.trim());
        relationships.imports.push({
          from: filePath,
          to: module,
          symbols,
          importType: 'named',
          lineNumber,
          statement: line
        });
      }

      // Extract class inheritance
      const classMatch = line.match(/^class\s+(\w+)\s*\(\s*([^)]+)\s*\):/);
      if (classMatch) {
        const className = classMatch[1];
        const parentClasses = classMatch[2].split(',').map(p => p.trim());
        parentClasses.forEach(parent => {
          relationships.classInheritance.push({
            from: className,
            to: parent,
            type: 'extends',
            lineNumber
          });
        });
      }

      // Extract function calls (simple pattern)
      const callMatches = line.matchAll(/(\w+)\.(\w+)\(/g);
      for (const match of callMatches) {
        relationships.functionCalls.push({
          from: filePath,
          to: match[2],
          object: match[1],
          lineNumber,
          callType: 'method',
          context: this.findPythonFunction(lines, i) || 'global'
        });
      }
    }
  }

  /**
   * Extract relationships using generic patterns for unsupported languages
   */
  private async extractGenericRelationships(
    content: string, 
    filePath: string, 
    relationships: CodeRelationships
  ): Promise<void> {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // Generic import patterns
      const importPatterns = [
        /^#include\s*[<"]([^>"]+)[>"]/, // C/C++
        /^import\s+([^;]+);/, // Java
        /^using\s+([^;]+);/, // C#
      ];

      for (const pattern of importPatterns) {
        const match = line.match(pattern);
        if (match) {
          relationships.dependencies.push({
            from: filePath,
            to: match[1],
            dependencyType: 'builtin',
            usage: ['include'],
          });
        }
      }

      // Generic class inheritance patterns
      const inheritancePatterns = [
        /class\s+(\w+)\s*:\s*public\s+(\w+)/, // C++
        /class\s+(\w+)\s+extends\s+(\w+)/, // Java
      ];

      for (const pattern of inheritancePatterns) {
        const match = line.match(pattern);
        if (match) {
          relationships.classInheritance.push({
            from: match[1],
            to: match[2],
            type: 'extends',
            lineNumber
          });
        }
      }
    }
  }

  /**
   * Resolve import path relative to current file
   */
  private resolveImportPath(importPath: string, currentFile: string): string {
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      // Relative import
      const currentDir = path.dirname(currentFile);
      return path.resolve(currentDir, importPath);
    } else {
      // Absolute or node_modules import
      return importPath;
    }
  }

  /**
   * Find containing function name for a Babel path
   */
  private findContainingFunction(path: any): string | null {
    let parent = path.parent;
    while (parent) {
      if (t.isFunctionDeclaration(parent) && parent.id) {
        return parent.id.name;
      } else if (t.isMethodDefinition(parent) && t.isIdentifier(parent.key)) {
        return parent.key.name;
      }
      parent = parent.parent;
    }
    return null;
  }

  /**
   * Find containing Python function name
   */
  private findPythonFunction(lines: string[], currentLine: number): string | null {
    for (let i = currentLine; i >= 0; i--) {
      const line = lines[i].trim();
      const funcMatch = line.match(/^def\s+(\w+)/);
      if (funcMatch) {
        return funcMatch[1];
      }
    }
    return null;
  }
}