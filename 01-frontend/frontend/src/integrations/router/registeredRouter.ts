import type { router } from './router';

type AppRouter = typeof router;

let registeredRouter: AppRouter | undefined;

/**
 * Registers the application router so non-component modules can read live router
 * state without statically importing the router module.
 *
 * A static `import { router }` pulls the full route tree (and the collections it
 * depends on) into the importer's module graph. For modules that the route tree
 * itself transitively depends on — such as the shared query client in
 * `root-provider` — that creates a load-order cycle where a collection evaluates
 * before the query client is initialized. This registry is a runtime leaf (its
 * only import is type-only), so importing it never triggers the route tree.
 *
 * @param router The application router instance, registered once at router creation.
 */
export const setRegisteredRouter = (router: AppRouter): void => {
  registeredRouter = router;
};

/**
 * Returns the registered application router, or `undefined` before the router
 * module has initialized (for example in unit tests that never mount the router).
 *
 * @returns The registered router instance, or `undefined` if not yet registered.
 */
export const getRegisteredRouter = (): AppRouter | undefined =>
  registeredRouter;
