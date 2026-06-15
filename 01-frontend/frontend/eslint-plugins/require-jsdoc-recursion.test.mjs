import { createRequire } from 'node:module';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

const require = createRequire(import.meta.url);
const plugin = require('./require-jsdoc-recursion.cjs');

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

ruleTester.run(
  'require-jsdoc-recursion',
  plugin.rules['require-jsdoc-recursion'],
  {
    valid: [
      {
        name: 'does not treat same-name object method calls as recursion',
        code: `
          function save() {
            api.save();
          }
        `,
      },
      {
        name: 'skips recursion inside nested function scopes',
        code: `
          function outer() {
            function inner() {
              outer();
            }
            inner();
          }
        `,
      },
      {
        name: 'allows documented direct recursion',
        code: `
          /**
           * Walks down from the input value until the base case is reached.
           */
          function walk(value) {
            if (value <= 0) return value;
            return walk(value - 1);
          }
        `,
      },
    ],
    invalid: [
      {
        name: 'requires JSDoc for direct self-calls',
        code: `
          function walk(value) {
            if (value <= 0) return value;
            return walk(value - 1);
          }
        `,
        errors: [{ messageId: 'missingJSDoc' }],
      },
    ],
  },
);
