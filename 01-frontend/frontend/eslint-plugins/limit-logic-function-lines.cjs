/**
 * Custom ESLint rule that limits line count for functions.
 *
 * By default JSX-returning functions are ignored, but that behavior can be
 * disabled when the repo wants to enforce the same size pressure on component
 * bodies with substantial logic.
 */

/**
 * Builds a prefix sum of countable lines so each function check is O(1).
 * @param {string[]} lines - Source lines
 * @param {boolean} skipBlankLines - Whether blank lines should be ignored
 * @param {boolean} skipComments - Whether comment-only lines should be ignored
 * @returns {number[]} Prefix sum array (1-based line indexing)
 */
function buildLinePrefix(lines, skipBlankLines, skipComments) {
  const prefix = new Array(lines.length + 1).fill(0);
  let insideBlockComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmedLine = line.trim();
    let countable = true;

    if (skipBlankLines && trimmedLine === '') {
      countable = false;
    } else if (skipComments) {
      if (insideBlockComment) {
        countable = false;

        const blockCommentEnd = trimmedLine.indexOf('*/');
        if (blockCommentEnd !== -1) {
          insideBlockComment = false;
          const trailingText = trimmedLine.slice(blockCommentEnd + 2).trim();
          if (trailingText !== '') {
            countable = true;
          }
        }
      } else if (trimmedLine.startsWith('//')) {
        countable = false;
      } else if (trimmedLine.startsWith('/*')) {
        const blockCommentEnd = trimmedLine.indexOf('*/');

        if (blockCommentEnd === -1) {
          insideBlockComment = true;
          countable = false;
        } else {
          const trailingText = trimmedLine.slice(blockCommentEnd + 2).trim();
          countable = trailingText !== '';
        }
      } else if (trimmedLine === '*/' || trimmedLine.startsWith('*')) {
        countable = false;
      }
    }

    prefix[index + 1] = prefix[index] + (countable ? 1 : 0);
  }

  return prefix;
}

/**
 * Detects whether a node contains JSX in its subtree.
 * @param {object | null | undefined} root - AST node to inspect
 * @returns {boolean} True when JSX is found
 */
function containsJsx(root) {
  if (!root || typeof root !== 'object') {
    return false;
  }

  const stack = [root];

  while (stack.length > 0) {
    const node = stack.pop();

    if (!node || typeof node !== 'object') {
      continue;
    }

    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      return true;
    }

    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'ClassDeclaration' ||
      node.type === 'ClassExpression'
    ) {
      continue;
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') {
        continue;
      }

      const child = node[key];

      if (Array.isArray(child)) {
        for (let index = child.length - 1; index >= 0; index -= 1) {
          stack.push(child[index]);
        }
      } else if (child && typeof child === 'object' && child.type) {
        stack.push(child);
      }
    }
  }

  return false;
}

/**
 * Detects whether a function returns JSX.
 * @param {import('estree').Function} node - Function node
 * @returns {boolean} True when the function returns JSX
 */
function returnsJsx(node) {
  if (!node.body) {
    return false;
  }

  if (
    node.type === 'ArrowFunctionExpression' &&
    node.body.type !== 'BlockStatement'
  ) {
    return containsJsx(node.body);
  }

  if (node.body.type !== 'BlockStatement') {
    return false;
  }

  const stack = [...node.body.body];

  while (stack.length > 0) {
    const currentNode = stack.pop();

    if (!currentNode || typeof currentNode !== 'object') {
      continue;
    }

    if (currentNode.type === 'ReturnStatement') {
      if (containsJsx(currentNode.argument)) {
        return true;
      }
      continue;
    }

    if (
      currentNode.type === 'FunctionDeclaration' ||
      currentNode.type === 'FunctionExpression' ||
      currentNode.type === 'ArrowFunctionExpression' ||
      currentNode.type === 'ClassDeclaration' ||
      currentNode.type === 'ClassExpression'
    ) {
      continue;
    }

    for (const key of Object.keys(currentNode)) {
      if (key === 'parent') {
        continue;
      }

      const child = currentNode[key];

      if (Array.isArray(child)) {
        for (let index = child.length - 1; index >= 0; index -= 1) {
          stack.push(child[index]);
        }
      } else if (child && typeof child === 'object' && child.type) {
        stack.push(child);
      }
    }
  }

  return false;
}

/**
 * Checks whether a function node is an immediately invoked function expression.
 * @param {object} node - Function node
 * @returns {boolean} True when the function is immediately invoked
 */
function isIIFE(node) {
  if (!node.parent) {
    return false;
  }

  if (node.parent.type === 'CallExpression' && node.parent.callee === node) {
    return true;
  }

  return (
    node.parent.type === 'ChainExpression' &&
    node.parent.expression &&
    node.parent.expression.type === 'CallExpression' &&
    node.parent.expression.callee === node
  );
}

/**
 * Gets a readable label for a function node.
 * @param {object} node - Function node
 * @returns {{messageId: string, name?: string}} Message identifier and optional name
 */
function getFunctionLabel(node) {
  let name = null;

  if (node.id && node.id.name) {
    name = node.id.name;
  } else if (
    node.parent &&
    node.parent.type === 'VariableDeclarator' &&
    node.parent.id &&
    node.parent.id.type === 'Identifier'
  ) {
    name = node.parent.id.name;
  } else if (
    node.parent &&
    node.parent.type === 'Property' &&
    node.parent.key &&
    node.parent.key.type === 'Identifier'
  ) {
    name = node.parent.key.name;
  } else if (
    node.parent &&
    node.parent.type === 'MethodDefinition' &&
    node.parent.key &&
    node.parent.key.type === 'Identifier'
  ) {
    name = node.parent.key.name;
  }

  if (!name) {
    if (node.parent && node.parent.type === 'MethodDefinition') {
      return { messageId: 'anonymousMethod' };
    }

    if (node.type === 'ArrowFunctionExpression') {
      return { messageId: 'anonymousArrowFunction' };
    }

    return { messageId: 'anonymousFunction' };
  }

  if (node.parent && node.parent.type === 'MethodDefinition') {
    return {
      messageId: 'namedMethod',
      name,
    };
  }

  if (node.type === 'ArrowFunctionExpression') {
    return {
      messageId: 'namedArrowFunction',
      name,
    };
  }

  return {
    messageId: 'namedFunction',
    name,
  };
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce a maximum number of lines in functions, with optional JSX-returning function support.',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [
      {
        oneOf: [
          {
            type: 'object',
            properties: {
              max: {
                type: 'integer',
                minimum: 0,
              },
              skipComments: {
                type: 'boolean',
              },
              skipBlankLines: {
                type: 'boolean',
              },
              IIFEs: {
                type: 'boolean',
              },
              ignoreJsxReturningFunctions: {
                type: 'boolean',
              },
            },
            additionalProperties: false,
          },
          {
            type: 'integer',
            minimum: 1,
          },
        ],
      },
    ],
    messages: {
      anonymousArrowFunction:
        'Arrow function has too many lines ({{lineCount}}). Maximum allowed is {{max}}.',
      namedArrowFunction:
        "Arrow function '{{name}}' has too many lines ({{lineCount}}). Maximum allowed is {{max}}.",
      anonymousFunction:
        'Function has too many lines ({{lineCount}}). Maximum allowed is {{max}}.',
      namedFunction:
        "Function '{{name}}' has too many lines ({{lineCount}}). Maximum allowed is {{max}}.",
      anonymousMethod:
        'Method has too many lines ({{lineCount}}). Maximum allowed is {{max}}.',
      namedMethod:
        "Method '{{name}}' has too many lines ({{lineCount}}). Maximum allowed is {{max}}.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    const rawOptions = context.options[0];
    const options =
      typeof rawOptions === 'number'
        ? {
            max: rawOptions,
          }
        : {
            max: 50,
            skipComments: false,
            skipBlankLines: false,
            IIFEs: false,
            ignoreJsxReturningFunctions: true,
            ...rawOptions,
          };

    const linePrefix = buildLinePrefix(
      sourceCode.lines,
      options.skipBlankLines,
      options.skipComments,
    );

    /**
     * Reports a function when it exceeds the configured logic-line limit.
     * @param {import('estree').Function} node - Function node
     */
    function checkFunction(node) {
      if (!node.loc || !node.body) {
        return;
      }

      if (!options.IIFEs && isIIFE(node)) {
        return;
      }

      if (options.ignoreJsxReturningFunctions && returnsJsx(node)) {
        return;
      }

      const startLine = node.loc.start.line;
      const endLine = node.loc.end.line;
      const lineCount = linePrefix[endLine] - linePrefix[startLine - 1];

      if (lineCount <= options.max) {
        return;
      }

      const label = getFunctionLabel(node);

      context.report({
        node,
        messageId: label.messageId,
        data: {
          ...(label.name ? { name: label.name } : {}),
          lineCount: String(lineCount),
          max: String(options.max),
        },
      });
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
    'limit-logic-function-lines': rule,
  },
};
