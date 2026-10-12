import { describe, expect, it } from 'vitest';

import dokumenteFixture from '../data/catalog-mock/fixtures/dokumente.json';
import { serializeYaml } from './yamlSerialize';

describe('serializeYaml', () => {
  it('emits scalars, null, empty collections, and quoted special strings', () => {
    const yaml = serializeYaml({
      flag: true,
      count: 2,
      empty: null,
      note: '',
      quoted: 'Name: value',
      list: [],
      map: {},
    });

    expect(yaml).toMatchInlineSnapshot(`
      "flag: true
      count: 2
      empty: null
      note: ""
      quoted: "Name: value"
      list: []
      map: {}
      "
    `);
  });

  it('nests objects in arrays with sibling-aligned keys', () => {
    const yaml = serializeYaml({
      categories: [
        {
          category: 'Teil A',
          document_types: [
            {
              name: 'Lageplan',
              description: 'Plan',
              expected_count: 1,
            },
          ],
        },
      ],
    });

    expect(yaml).toContain('category: Teil A');
    expect(yaml).toContain('name: Lageplan');
    expect(yaml).toContain('expected_count: 1');
    expect(yaml).toMatchInlineSnapshot(`
      "categories:
        - category: Teil A
          document_types:
            - name: Lageplan
              description: Plan
              expected_count: 1
      "
    `);
  });

  it('serializes the dokumente fixture with expected keys and values', () => {
    const yaml = serializeYaml(dokumenteFixture);

    expect(yaml).toContain('category: Teil A - Vorhabensbeschreibung');
    expect(yaml).toContain('name: Erläuterungsbericht');
    expect(yaml).toContain('expected_count: 1');
    expect(yaml.startsWith('categories:\n')).toBe(true);
  });
});
