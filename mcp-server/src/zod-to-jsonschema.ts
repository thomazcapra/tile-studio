// Minimal Zod -> JSON Schema converter for our tool schemas.
//
// We intentionally avoid the full `zod-to-json-schema` package because (a) we
// only use a small subset of Zod, and (b) we want predictable output that the
// MCP spec accepts. Everything below maps the Zod nodes our tools actually
// build in tools.ts.

import { z, type ZodTypeAny } from 'zod';

interface JsonSchemaObject {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  items?: JsonSchemaObject;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean | JsonSchemaObject;
  oneOf?: JsonSchemaObject[];
  anyOf?: JsonSchemaObject[];
  format?: string;
  [k: string]: unknown;
}

// We deliberately treat `_def` as opaque and reach into it via untyped helpers
// since Zod's internal typings change between minor versions.
function pick<T = unknown>(def: unknown, key: string): T | undefined {
  return (def as Record<string, T> | null)?.[key];
}

export function zodToJsonSchema(schema: ZodTypeAny): JsonSchemaObject {
  const def = schema._def as { typeName: string };
  const typeName = def.typeName;

  if (typeName === 'ZodDefault') {
    const inner = zodToJsonSchema(pick<ZodTypeAny>(def, 'innerType')!);
    const fn = pick<() => unknown>(def, 'defaultValue');
    if (fn) inner.default = fn();
    return inner;
  }
  if (typeName === 'ZodOptional') {
    return zodToJsonSchema(pick<ZodTypeAny>(def, 'innerType')!);
  }
  if (typeName === 'ZodNullable') {
    const inner = zodToJsonSchema(pick<ZodTypeAny>(def, 'innerType')!);
    return { anyOf: [inner, { type: 'null' }] };
  }

  if (typeName === 'ZodString') {
    const out: JsonSchemaObject = { type: 'string' };
    const checks = pick<{ kind: string; value?: unknown; regex?: RegExp }[]>(def, 'checks') ?? [];
    for (const c of checks) {
      if (c.kind === 'min') out.minLength = c.value as number;
      else if (c.kind === 'max') out.maxLength = c.value as number;
      else if (c.kind === 'regex' && c.regex) out.pattern = c.regex.source;
    }
    return out;
  }
  if (typeName === 'ZodNumber') {
    const out: JsonSchemaObject = { type: 'number' };
    const checks = pick<{ kind: string; value?: number; inclusive?: boolean }[]>(def, 'checks') ?? [];
    for (const c of checks) {
      if (c.kind === 'int') out.type = 'integer';
      else if (c.kind === 'min') out.minimum = c.value;
      else if (c.kind === 'max') out.maximum = c.value;
    }
    return out;
  }
  if (typeName === 'ZodBoolean') {
    return { type: 'boolean' };
  }
  if (typeName === 'ZodLiteral') {
    return { const: pick(def, 'value') };
  }
  if (typeName === 'ZodEnum') {
    const values = pick<string[]>(def, 'values') ?? [];
    return { type: 'string', enum: values };
  }
  if (typeName === 'ZodArray') {
    const inner = zodToJsonSchema(pick<ZodTypeAny>(def, 'type')!);
    const out: JsonSchemaObject = { type: 'array', items: inner };
    const min = pick<{ value: number }>(def, 'minLength');
    const max = pick<{ value: number }>(def, 'maxLength');
    if (min) out.minItems = min.value;
    if (max) out.maxItems = max.value;
    return out;
  }
  if (typeName === 'ZodObject') {
    const shape = (schema as unknown as { shape: Record<string, ZodTypeAny> }).shape;
    const properties: Record<string, JsonSchemaObject> = {};
    const required: string[] = [];
    for (const [key, child] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(child);
      const childTypeName = (child._def as { typeName: string }).typeName;
      if (childTypeName !== 'ZodOptional' && childTypeName !== 'ZodDefault') {
        required.push(key);
      }
    }
    const out: JsonSchemaObject = { type: 'object', properties };
    if (required.length) out.required = required;
    out.additionalProperties = false;
    return out;
  }
  if (typeName === 'ZodRecord') {
    const valSchema = pick<ZodTypeAny>(def, 'valueType');
    return {
      type: 'object',
      additionalProperties: valSchema ? zodToJsonSchema(valSchema) : true,
    };
  }
  if (typeName === 'ZodAny' || typeName === 'ZodUnknown') {
    return {};
  }
  if (typeName === 'ZodVoid' || typeName === 'ZodUndefined') {
    return { type: 'null' };
  }
  return {};
}

export type { ZodTypeAny } from 'zod';
export { z };
