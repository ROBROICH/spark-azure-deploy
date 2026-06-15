/**
 * Custom ESLint rule that requires JSDoc comments for functions
 * that exceed a certain complexity threshold.
 *
 * This implementation merges Cognitive Complexity (SonarSource) and
 * Cyclomatic Complexity approaches:
 * - Nesting depth (nested code is harder to understand) - from cognitive
 * - Recursion (self-referential calls are complex) - from cognitive
 * - Sequences of same logical operators count once - from cognitive
 * - Switch cases count individually - from cyclomatic
 * - Nullish coalescing (??) adds complexity - from cyclomatic
 * - Labeled break/continue adds complexity - from cognitive
 * - JSX elements add complexity - custom addition
 */

/**
 * Configuration map for complexity weights.
 * Adjust these values to control how much each feature contributes to complexity.
 */
const COMPLEXITY_WEIGHTS = {
  // Control flow structures (with nesting bonus)
  ifStatement: 8,
  elseClause: 8,
  forLoop: 12,
  whileLoop: 12,
  doWhileLoop: 12,
  switchStatement: 8,
  switchCase: 8,
  catchClause: 10,
  conditionalExpression: 8, // Ternary operator

  // Logical operators (no nesting bonus)
  logicalAndOr: 4, // && and || sequences
  nullishCoalescing: 4, // ??

  // Special cases
  recursion: 0, // managed by require-jsdoc-recursion rule
  labeledBreakContinue: 8,

  // React hooks (no nesting bonus)
  useEffect: 24, // useEffect adds more complexity
  otherHooks: 2, // Other React hooks (useState, useContext, etc.)

  // JSX elements (no nesting bonus)
  jsxElement: 1,
  jsxFragment: 1,

  // Declarations (with nesting bonus)
  functionDeclaration: 5, // Nested function declarations
  objectExpression: 5, // Object literals

  // Nesting bonus (added per nesting level)
  nestingBonus: 8, // Added for each level of nesting
};

/**
 * Calculates complexity of an AST node using a merged approach.
 *
 * Combines features from both cognitive and cyclomatic complexity:
 * - Increments for control flow breaks (if, for, while, catch, etc.)
 * - Additional increment for each level of nesting
 * - Switch cases count individually (each case adds complexity)
 * - Sequences of same logical operators count once
 * - Recursion adds complexity
 * - Nullish coalescing (??) adds complexity
 *
 * @param {object} node - The function AST node to analyze
 * @param {string|null} functionName - Name of the function (for recursion detection)
 * @returns {number} The complexity score
 */
function calculateCognitiveComplexity(node, functionName) {
  let complexity = 0;
  let currentNestingLevel = 0;

  // Track if we're in a sequence of same logical operators
  let lastLogicalOperator = null;

  /**
   * Increases complexity with nesting bonus.
   * @param {number} base - Base increment from COMPLEXITY_WEIGHTS
   */
  function incrementWithNesting(base = 1) {
    complexity += base + currentNestingLevel * COMPLEXITY_WEIGHTS.nestingBonus;
  }

  /**
   * Increases complexity without nesting bonus.
   * @param {number} base - Base increment from COMPLEXITY_WEIGHTS
   */
  function incrementWithoutNesting(base = 1) {
    complexity += base;
  }

  /**
   * Recursively traverses the AST and calculates cognitive complexity.
   * @param {object} currentNode - Current AST node being visited
   * @param {boolean} isNestingContext - Whether this node creates a nesting context
   */
  function traverse(currentNode, isNestingContext = false) {
    if (!currentNode || typeof currentNode !== 'object') {
      return;
    }

    // Track whether we entered a new nesting level
    let enteredNesting = false;

    switch (currentNode.type) {
      // ===== STRUCTURAL INCREMENTS (with nesting) =====

      case 'IfStatement':
        // 'if' increments with nesting
        incrementWithNesting(COMPLEXITY_WEIGHTS.ifStatement);
        enteredNesting = true;

        // Traverse condition (for logical operators)
        traverse(currentNode.test);

        // Traverse consequent with increased nesting
        currentNestingLevel++;
        traverse(currentNode.consequent);
        currentNestingLevel--;

        // 'else if' is a hybrid increment (no nesting bonus for the else if itself)
        // 'else' is a hybrid increment (no nesting bonus)
        if (currentNode.alternate) {
          if (currentNode.alternate.type === 'IfStatement') {
            // else if - increment without nesting bonus, then process the if
            incrementWithoutNesting(COMPLEXITY_WEIGHTS.elseClause); // for 'else'
            traverse(currentNode.alternate);
          } else {
            // else block
            incrementWithoutNesting(COMPLEXITY_WEIGHTS.elseClause); // for 'else'
            currentNestingLevel++;
            traverse(currentNode.alternate);
            currentNestingLevel--;
          }
        }
        return; // Already handled children

      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
        incrementWithNesting(COMPLEXITY_WEIGHTS.forLoop);
        enteredNesting = true;
        break;

      case 'WhileStatement':
        incrementWithNesting(COMPLEXITY_WEIGHTS.whileLoop);
        enteredNesting = true;
        break;

      case 'DoWhileStatement':
        incrementWithNesting(COMPLEXITY_WEIGHTS.doWhileLoop);
        enteredNesting = true;
        break;

      case 'SwitchStatement':
        // Switch statement itself adds complexity with nesting
        incrementWithNesting(COMPLEXITY_WEIGHTS.switchStatement);
        enteredNesting = true;
        // Cases will be handled individually in SwitchCase handler
        break;

      case 'SwitchCase':
        // Each case (except default) adds complexity with nesting
        // Default case (test === null) doesn't add complexity
        if (currentNode.test !== null) {
          incrementWithNesting(COMPLEXITY_WEIGHTS.switchCase);
        }
        break;

      case 'CatchClause':
        incrementWithNesting(COMPLEXITY_WEIGHTS.catchClause);
        enteredNesting = true;
        break;

      case 'ConditionalExpression':
        // Ternary operator - increments with nesting
        incrementWithNesting(COMPLEXITY_WEIGHTS.conditionalExpression);
        // Don't increase nesting for ternary branches (they're expressions)
        break;

      // ===== LOGICAL OPERATORS (sequences count as one) =====

      case 'LogicalExpression':
        // Handle && and || operators (sequences count as one)
        if (currentNode.operator === '&&' || currentNode.operator === '||') {
          if (lastLogicalOperator !== currentNode.operator) {
            incrementWithoutNesting(COMPLEXITY_WEIGHTS.logicalAndOr); // Logical sequences don't get nesting bonus
            lastLogicalOperator = currentNode.operator;
          }
          // Traverse children to continue checking the sequence
          traverse(currentNode.left);
          traverse(currentNode.right);
          // Reset after leaving this expression tree
          if (
            currentNode.parent &&
            currentNode.parent.type !== 'LogicalExpression'
          ) {
            lastLogicalOperator = null;
          }
          return; // Already handled children
        }
        // Nullish coalescing (??) adds complexity (from cyclomatic complexity)
        if (currentNode.operator === '??') {
          incrementWithoutNesting(COMPLEXITY_WEIGHTS.nullishCoalescing);
          // Traverse children
          traverse(currentNode.left);
          traverse(currentNode.right);
          return; // Already handled children
        }
        break;

      // ===== RECURSION DETECTION AND REACT HOOKS =====

      case 'CallExpression':
        if (currentNode.callee) {
          let calleeName = null;
          if (currentNode.callee.type === 'Identifier') {
            calleeName = currentNode.callee.name;
          } else if (
            currentNode.callee.type === 'MemberExpression' &&
            currentNode.callee.property &&
            currentNode.callee.property.type === 'Identifier'
          ) {
            // this.methodName() or obj.methodName()
            calleeName = currentNode.callee.property.name;
          }

          if (calleeName) {
            // Check for recursion
            if (functionName && calleeName === functionName) {
              // Recursion is inherently complex - add extra weight + nesting
              incrementWithNesting(COMPLEXITY_WEIGHTS.recursion); // Recursion gets higher base complexity + nesting bonus
            }
            // Check for React hooks (names starting with "use")
            else if (calleeName.startsWith('use')) {
              if (calleeName === 'useEffect') {
                // useEffect adds more complexity
                incrementWithoutNesting(COMPLEXITY_WEIGHTS.useEffect);
              } else {
                // Other React hooks (useState, useContext, useMemo, etc.)
                incrementWithoutNesting(COMPLEXITY_WEIGHTS.otherHooks);
              }
            }
          }
        }
        break;

      // ===== LABELED BREAK/CONTINUE =====

      case 'BreakStatement':
      case 'ContinueStatement':
        // Only increment if it has a label (jumping to a label is complex)
        if (currentNode.label) {
          incrementWithoutNesting(COMPLEXITY_WEIGHTS.labeledBreakContinue);
        }
        break;

      // ===== JSX ELEMENTS =====

      case 'JSXElement':
        // Plain JSX elements add a small amount of complexity
        // Each element counts as configured (no nesting bonus for JSX structure itself)
        incrementWithoutNesting(COMPLEXITY_WEIGHTS.jsxElement);
        break;

      case 'JSXFragment':
        // JSX fragments add a small amount of complexity
        incrementWithoutNesting(COMPLEXITY_WEIGHTS.jsxFragment);
        break;

      // ===== FUNCTION AND OBJECT DECLARATIONS =====

      case 'FunctionDeclaration':
        // Nested function declarations add complexity
        // Any FunctionDeclaration encountered during traversal is nested (we start from function body)
        incrementWithNesting(COMPLEXITY_WEIGHTS.functionDeclaration);
        enteredNesting = true;
        break;

      case 'ObjectExpression':
        // Object literals add complexity (especially nested objects)
        incrementWithNesting(COMPLEXITY_WEIGHTS.objectExpression);
        enteredNesting = true;
        break;

      default:
        break;
    }

    // Increase nesting for structural constructs
    if (enteredNesting) {
      currentNestingLevel++;
    }

    // Recursively traverse child nodes
    for (const key in currentNode) {
      if (key === 'parent') continue; // Skip parent references

      const child = currentNode[key];
      if (Array.isArray(child)) {
        child.forEach((c) => traverse(c));
      } else if (child && typeof child === 'object' && child.type) {
        traverse(child);
      }
    }

    // Decrease nesting after processing
    if (enteredNesting) {
      currentNestingLevel--;
    }
  }

  // Start traversal from the function body
  const body = node.body;
  if (body) {
    traverse(body);
  }

  return complexity;
}

/**
 * Checks if a node has a JSDoc comment.
 * @param {object} sourceCode - ESLint source code object
 * @param {object} node - The AST node to check
 * @returns {boolean} True if the node has a JSDoc comment
 */
function hasJSDocComment(sourceCode, node) {
  const comments = sourceCode.getCommentsBefore(node);

  // Check the last comment before the node
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    if (comment.type === 'Block' && comment.value.startsWith('*')) {
      // Verify it's directly before the node (no code in between)
      const tokenAfterComment = sourceCode.getTokenAfter(comment, {
        includeComments: false,
      });
      const firstToken = sourceCode.getFirstToken(node);

      if (
        tokenAfterComment &&
        firstToken &&
        tokenAfterComment.range[0] === firstToken.range[0]
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a function is anonymous (not assigned to a named variable/property).
 * @param {object} node - The function AST node
 * @returns {boolean} True if the function is anonymous
 */
function isAnonymousFunction(node) {
  // Has a direct name (function foo() {})
  if (node.id && node.id.name) {
    return false;
  }

  if (node.parent) {
    // Assigned to a variable (const foo = () => {})
    if (
      node.parent.type === 'VariableDeclarator' &&
      node.parent.id &&
      node.parent.id.name
    ) {
      return false;
    }
    // Object property (key: () => {})
    if (
      node.parent.type === 'Property' &&
      node.parent.key &&
      node.parent.key.name
    ) {
      return false;
    }
    // Class method
    if (
      node.parent.type === 'MethodDefinition' &&
      node.parent.key &&
      node.parent.key.name
    ) {
      return false;
    }
    // Default export (export default function() {})
    if (node.parent.type === 'ExportDefaultDeclaration') {
      return false;
    }
    // Assignment expression (foo = () => {})
    if (
      node.parent.type === 'AssignmentExpression' &&
      node.parent.left &&
      node.parent.left.type === 'Identifier'
    ) {
      return false;
    }
  }

  // Callback or inline function
  return true;
}

/**
 * Gets the name of a function node for error reporting and recursion detection.
 * @param {object} node - The function AST node
 * @returns {string|null} The function name or null if anonymous
 */
function getFunctionName(node) {
  if (node.id && node.id.name) {
    return node.id.name;
  }

  // Check parent for variable declaration
  if (node.parent) {
    if (
      node.parent.type === 'VariableDeclarator' &&
      node.parent.id &&
      node.parent.id.name
    ) {
      return node.parent.id.name;
    }
    if (
      node.parent.type === 'Property' &&
      node.parent.key &&
      node.parent.key.name
    ) {
      return node.parent.key.name;
    }
    if (
      node.parent.type === 'MethodDefinition' &&
      node.parent.key &&
      node.parent.key.name
    ) {
      return node.parent.key.name;
    }
    if (
      node.parent.type === 'AssignmentExpression' &&
      node.parent.left &&
      node.parent.left.type === 'Identifier'
    ) {
      return node.parent.left.name;
    }
  }

  return null;
}

/**
 * Gets a display name for error messages.
 * @param {object} node - The function AST node
 * @returns {string} The function name for display
 */
function getDisplayName(node) {
  const name = getFunctionName(node);
  if (name) {
    return `'${name}'`;
  }
  if (node.parent && node.parent.type === 'ExportDefaultDeclaration') {
    return 'default export';
  }
  return 'anonymous function';
}

/**
 * Gets the node to check for JSDoc (handles variable declarations).
 * @param {object} node - The function AST node
 * @returns {object} The node to check for JSDoc comments
 */
function getJSDocTarget(node) {
  if (node.parent) {
    // For arrow functions in variable declarations
    if (node.parent.type === 'VariableDeclarator') {
      if (
        node.parent.parent &&
        node.parent.parent.type === 'VariableDeclaration'
      ) {
        // Check if it's exported
        if (
          node.parent.parent.parent &&
          node.parent.parent.parent.type === 'ExportNamedDeclaration'
        ) {
          return node.parent.parent.parent;
        }
        return node.parent.parent;
      }
    }
    // For exported function declarations
    if (node.parent.type === 'ExportNamedDeclaration') {
      return node.parent;
    }
    if (node.parent.type === 'ExportDefaultDeclaration') {
      return node.parent;
    }
  }
  return node;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require JSDoc comments for functions exceeding a complexity threshold (merges cognitive and cyclomatic complexity)',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [
      {
        type: 'object',
        properties: {
          complexityThreshold: {
            type: 'integer',
            minimum: 1,
            default: 5,
            description: 'Complexity threshold above which JSDoc is required',
          },
          includeArrowFunctions: {
            type: 'boolean',
            default: true,
            description: 'Check arrow functions',
          },
          includeFunctionExpressions: {
            type: 'boolean',
            default: true,
            description: 'Check function expressions',
          },
          includeFunctionDeclarations: {
            type: 'boolean',
            default: true,
            description: 'Check function declarations',
          },
          includeMethodDefinitions: {
            type: 'boolean',
            default: true,
            description: 'Check class method definitions',
          },
          ignoreAnonymousFunctions: {
            type: 'boolean',
            default: true,
            description:
              'Skip anonymous functions (callbacks, inline functions)',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingJSDoc:
        'Function {{name}} has a complexity of {{complexity}} (threshold: {{threshold}}). Please add a JSDoc comment.',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const complexityThreshold = options.complexityThreshold ?? 5;
    const includeArrowFunctions = options.includeArrowFunctions ?? true;
    const includeFunctionExpressions =
      options.includeFunctionExpressions ?? true;
    const includeFunctionDeclarations =
      options.includeFunctionDeclarations ?? true;
    const includeMethodDefinitions = options.includeMethodDefinitions ?? true;
    const ignoreAnonymousFunctions = options.ignoreAnonymousFunctions ?? true;

    const sourceCode = context.sourceCode || context.getSourceCode();

    /**
     * Checks a function node for complexity and JSDoc presence.
     * @param {object} node - The function AST node
     */
    function checkFunction(node) {
      // Skip anonymous functions if configured
      if (ignoreAnonymousFunctions && isAnonymousFunction(node)) {
        return;
      }

      const functionName = getFunctionName(node);
      const complexity = calculateCognitiveComplexity(node, functionName);

      if (complexity > complexityThreshold) {
        const jsdocTarget = getJSDocTarget(node);

        if (!hasJSDocComment(sourceCode, jsdocTarget)) {
          context.report({
            node,
            messageId: 'missingJSDoc',
            data: {
              name: getDisplayName(node),
              complexity: complexity.toString(),
              threshold: complexityThreshold.toString(),
            },
          });
        }
      }
    }

    const listeners = {};

    if (includeFunctionDeclarations) {
      listeners.FunctionDeclaration = checkFunction;
    }

    if (includeArrowFunctions) {
      listeners.ArrowFunctionExpression = checkFunction;
    }

    if (includeFunctionExpressions) {
      listeners.FunctionExpression = (node) => {
        // Skip if it's a method (handled by MethodDefinition)
        if (node.parent && node.parent.type === 'MethodDefinition') {
          return;
        }
        checkFunction(node);
      };
    }

    if (includeMethodDefinitions) {
      listeners.MethodDefinition = (node) => {
        if (node.value) {
          // Skip anonymous functions check for methods (they always have names)
          const functionName = getFunctionName(node.value);
          const complexity = calculateCognitiveComplexity(
            node.value,
            functionName,
          );

          if (complexity > complexityThreshold) {
            if (!hasJSDocComment(sourceCode, node)) {
              context.report({
                node,
                messageId: 'missingJSDoc',
                data: {
                  name: getDisplayName(node.value),
                  complexity: complexity.toString(),
                  threshold: complexityThreshold.toString(),
                },
              });
            }
          }
        }
      };
    }

    return listeners;
  },
};

// Export as ESLint plugin format
module.exports = {
  rules: {
    'require-jsdoc-complexity': rule,
  },
};
