import { isEqual, isString } from "es-toolkit";

import { httpJsonObject, type HttpJson, type HttpJsonObject } from "./json.ts";

const schemaReferencePrefix = "#/components/schemas/";

function visitObjects(value: HttpJson | undefined, visit: (object: HttpJsonObject) => void): void {
  if (Array.isArray(value)) {
    for (const child of value) visitObjects(child, visit);
    return;
  }
  const object = httpJsonObject(value);
  if (object === undefined) return;
  visit(object);
  for (const child of Object.values(object)) visitObjects(child, visit);
}

function collectInlineDefinitions(value: HttpJson): ReadonlyMap<string, HttpJson> {
  const definitions = new Map<string, HttpJson>();
  visitObjects(value, (object) => {
    const inline = httpJsonObject(object.$defs);
    if (inline === undefined) return;
    for (const [name, definition] of Object.entries(inline)) {
      if (definition === undefined) continue;
      const existing = definitions.get(name);
      if (existing !== undefined && !isEqual(existing, definition)) {
        throw new TypeError(`Conflicting OpenAPI schema '${name}'`);
      }
      definitions.set(name, definition);
    }
  });
  return definitions;
}

export function canonicalizeOpenApiSchemaReferences(value: HttpJson): HttpJson {
  const document = httpJsonObject(value);
  if (document === undefined) return value;
  const components = httpJsonObject(document.components) ?? {};
  const schemas = httpJsonObject(components.schemas) ?? {};
  const definitions = collectInlineDefinitions(document);

  for (const [name, definition] of definitions) {
    const existing = schemas[name];
    if (existing !== undefined && !isEqual(existing, definition)) {
      throw new TypeError(`Conflicting OpenAPI schema '${name}'`);
    }
  }
  for (const [name, definition] of definitions) schemas[name] = definition;

  document.components = components;
  components.schemas = schemas;
  visitObjects(document, (object) => {
    delete object.$defs;
    const reference = object.$ref;
    if (!isString(reference) || reference.length === 0) return;
    const name = reference.startsWith(schemaReferencePrefix)
      ? reference.slice(schemaReferencePrefix.length)
      : reference;
    if (!Object.hasOwn(schemas, name)) {
      throw new TypeError(`OpenAPI schema reference '${reference}' does not resolve`);
    }
    object.$ref = `${schemaReferencePrefix}${name}`;
  });
  return value;
}
