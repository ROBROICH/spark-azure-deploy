import type { AnyResource, ResourceValue } from "./resource";

export interface ResourceRuntime<Available extends AnyResource> {
  get<Value extends Available>(resource: Value): Promise<ResourceValue<Value>>;
  ready(): Promise<void>;
  close(): Promise<void>;
}
