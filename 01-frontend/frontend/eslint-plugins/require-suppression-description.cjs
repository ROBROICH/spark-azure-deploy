/**
 * Custom ESLint rule that requires narrow, justified eslint-disable comments.
 */

/**
 * Normalizes block and line comments into a single comparable string.
 * @param {string} value - Raw comment value from ESLint
 * @returns {string} Normalized comment content
 */
function normalizeComment(value) {
  return value
    .replace(/^\s*\* ?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts the eslint-disable directive payload and optional description.
 * @param {string} commentText - Normalized comment content
 * @returns {{directive: string, ruleList: string, description: string} | null}
 */
function parseDirective(commentText) {
  const [directivePart, ...descriptionParts] = commentText.split(/\s--\s*/);
  const match = directivePart.match(
    /^(eslint-disable(?:-next-line|-line)?)(?:\s+(.*))?$/,
  );

  if (!match) {
    return null;
  }

  return {
    directive: match[1],
    ruleList: (match[2] || '').trim(),
    description: descriptionParts.join(' -- ').trim(),
  };
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require eslint-disable comments to name the suppressed rule and explain why the suppression is necessary.',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [
      {
        type: 'object',
        properties: {
          minimumDescriptionLength: {
            type: 'integer',
            minimum: 1,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingRule:
        'ESLint suppression comments must name the specific rule being disabled.',
      missingDescription:
        'ESLint suppression comments must include a reason after "--".',
      shortDescription:
        'ESLint suppression reason must be at least {{minimum}} characters long.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    const minimumDescriptionLength =
      context.options[0]?.minimumDescriptionLength ?? 10;

    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          const parsedDirective = parseDirective(normalizeComment(comment.value));

          if (!parsedDirective) {
            continue;
          }

          if (!parsedDirective.ruleList) {
            context.report({
              loc: comment.loc,
              messageId: 'missingRule',
            });
            continue;
          }

          if (!parsedDirective.description) {
            context.report({
              loc: comment.loc,
              messageId: 'missingDescription',
            });
            continue;
          }

          if (parsedDirective.description.length < minimumDescriptionLength) {
            context.report({
              loc: comment.loc,
              messageId: 'shortDescription',
              data: {
                minimum: String(minimumDescriptionLength),
              },
            });
          }
        }
      },
    };
  },
};

module.exports = {
  rules: {
    'require-suppression-description': rule,
  },
};
