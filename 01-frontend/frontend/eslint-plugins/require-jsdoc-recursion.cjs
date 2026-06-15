/**
 * Custom ESLint rule that requires JSDoc comments for recursive functions.
 * Recursive functions are inherently complex and should be documented.
 */

/**
 * Gets the name of a function node for recursion detection.
 * @param {object} node - The function AST node
 * @returns {string|null} The function name or null if anonymous
 */
function getFunctionName(node) {
  // Direct name (function foo() {})
  if (node.id && node.id.name) {
    return node.id.name;
  }

  if (node.parent) {
    // Variable declaration (const foo = () => {})
    if (
      node.parent.type === 'VariableDeclarator' &&
      node.parent.id &&
      node.parent.id.name
    ) {
      return node.parent.id.name;
    }
    // Object property (key: () => {})
    if (
      node.parent.type === 'Property' &&
      node.parent.key &&
      node.parent.key.name
    ) {
      return node.parent.key.name;
    }
    // Class method
    if (
      node.parent.type === 'MethodDefinition' &&
      node.parent.key &&
      node.parent.key.name
    ) {
      return node.parent.key.name;
    }
    // Assignment expression (foo = () => {})
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
 * Checks if a function body contains a recursive call to the given function name.
 * @param {object} body - The function body AST node
 * @param {string} functionName - The name of the function to detect recursion for
 * @returns {boolean} True if the function contains a recursive call
 */
function containsRecursiveCall(body, functionName) {
  if (!body || !functionName) return false;

  let hasRecursion = false;

  function traverse(node) {
    if (!node || typeof node !== 'object' || hasRecursion) return;

    if (node.type === 'CallExpression' && node.callee) {
      if (node.callee.type === 'Identifier') {
        if (node.callee.name === functionName) {
          hasRecursion = true;
          return;
        }
      }
    }

    // Skip nested function bodies - they have their own scope
    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      // Don't traverse into nested functions
      return;
    }

    // Recursively traverse child nodes
    for (const key in node) {
      if (key === 'parent') continue;

      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach((c) => traverse(c));
      } else if (child && typeof child === 'object' && child.type) {
        traverse(child);
      }
    }
  }

  traverse(body);
  return hasRecursion;
}

/**
 * Checks if a node has a JSDoc comment.
 * @param {object} sourceCode - ESLint source code object
 * @param {object} node - The AST node to check
 * @returns {boolean} True if the node has a JSDoc comment
 */
function hasJSDocComment(sourceCode, node) {
  const comments = sourceCode.getCommentsBefore(node);

  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i];
    if (comment.type === 'Block' && comment.value.startsWith('*')) {
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
 * Gets the node to check for JSDoc (handles variable declarations and exports).
 * @param {object} node - The function AST node
 * @returns {object} The node to check for JSDoc comments
 */
function getJSDocTarget(node) {
  if (node.parent) {
    if (node.parent.type === 'VariableDeclarator') {
      if (
        node.parent.parent &&
        node.parent.parent.type === 'VariableDeclaration'
      ) {
        if (
          node.parent.parent.parent &&
          node.parent.parent.parent.type === 'ExportNamedDeclaration'
        ) {
          return node.parent.parent.parent;
        }
        return node.parent.parent;
      }
    }
    if (node.parent.type === 'ExportNamedDeclaration') {
      return node.parent;
    }
    if (node.parent.type === 'ExportDefaultDeclaration') {
      return node.parent;
    }
  }
  return node;
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
  return 'anonymous function';
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require JSDoc comments for recursive functions',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [],
    messages: {
      missingJSDoc:
        'Recursive function {{name}} requires a JSDoc comment explaining the recursion.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    function checkFunction(node) {
      const functionName = getFunctionName(node);
      if (!functionName) return;

      if (containsRecursiveCall(node.body, functionName)) {
        const jsdocTarget = getJSDocTarget(node);

        if (!hasJSDocComment(sourceCode, jsdocTarget)) {
          context.report({
            node,
            messageId: 'missingJSDoc',
            data: {
              name: getDisplayName(node),
            },
          });
        }
      }
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
    };
  },
};

module.exports = {
  rules: {
    'require-jsdoc-recursion': rule,
  },
};
