/**
 * The Temporal sandbox does not provide `crypto` because it is
 * non-deterministic. Some packages still read the global `crypto` with
 * optional chaining (`crypto?.…`) and fall back when it is missing. That
 * check throws a ReferenceError when the variable does not exist at all.
 * This file creates `crypto` and assigns `undefined` so those fallbacks
 * can run. Packages that actually need `crypto` will not work here and
 * must be imported lazily inside an activity.
 */
export let crypto = void 0;

