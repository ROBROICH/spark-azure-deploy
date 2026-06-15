import { z } from 'zod';

export type SwimlanesGroupSearchSchema<
  TName extends string = string,
  TValue extends string = string,
> = z.ZodObject<{
  [K in TName]: z.ZodType<TValue>;
}>;

export type SwimlanesGroupSearchKey<
  TSchema extends SwimlanesGroupSearchSchema,
> = Extract<keyof z.output<TSchema>, string>;

export type SwimlanesGroupLaneId<TSchema extends SwimlanesGroupSearchSchema> =
  Extract<z.output<TSchema>[SwimlanesGroupSearchKey<TSchema>], string>;

export const createSwimlanesGroupSearchSchema = <
  TName extends string,
  TValues extends readonly [string, ...string[]],
>(
  name: TName,
  values: TValues,
): SwimlanesGroupSearchSchema<TName, TValues[number]> => {
  const defaultValue = values[0];

  return z.object({
    [name]: z.enum(values).catch(defaultValue).default(defaultValue),
  }) as unknown as SwimlanesGroupSearchSchema<TName, TValues[number]>;
};

export const getSwimlanesGroupSearchKey = <
  TSchema extends SwimlanesGroupSearchSchema,
>(
  searchSchema: TSchema,
): SwimlanesGroupSearchKey<TSchema> => {
  const keys = Object.keys(searchSchema.shape);

  if (keys.length !== 1) {
    throw new Error(
      'Swimlanes.Group searchSchema must define exactly one key.',
    );
  }

  // Runtime-validated: the guard above ensures exactly one key exists
  return keys[0] as SwimlanesGroupSearchKey<TSchema>;
};

export const getSwimlanesGroupDefaultValue = <
  TSchema extends SwimlanesGroupSearchSchema,
>(
  searchSchema: TSchema,
): SwimlanesGroupLaneId<TSchema> => {
  const key = getSwimlanesGroupSearchKey(searchSchema);

  // Runtime-derived: parse({}) triggers Zod defaults, and the key is validated by getSwimlanesGroupSearchKey above
  return searchSchema.parse({})[key] as SwimlanesGroupLaneId<TSchema>;
};
