import { FormatRegistry } from "@sinclair/typebox";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set("uuid", (value) => uuid.test(value));
}

if (!FormatRegistry.Has("date-time")) {
  FormatRegistry.Set("date-time", (value) => !Number.isNaN(new Date(value).valueOf()));
}
