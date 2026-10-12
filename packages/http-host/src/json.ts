import { isPlainObject } from "es-toolkit";

export type HttpJson =
  | string
  | number
  | boolean
  | null
  | readonly HttpJson[]
  | { readonly [key: string]: HttpJson | undefined };

export type HttpJsonObject = { [key: string]: HttpJson | undefined };

export const httpJsonObject = (value: HttpJson | undefined): HttpJsonObject | undefined =>
  value !== undefined && isPlainObject(value) ? (value as HttpJsonObject) : undefined;

export const isoInstant = (value: Date): string => value.toISOString().replace(/\.000Z$/, "Z");
