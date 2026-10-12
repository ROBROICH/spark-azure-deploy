# Backend test support

`@spark-workflow/test-support` lets backend tests run the real permission checks without Keycloak or SpiceDB. A test lists the permissions a user has and signs a login token. The backend then checks that token exactly as it does in production.

## Core Features

- `useStrictAuthentication` creates a signing key and serves its public part from a small local server, the way Keycloak does. The backend verifies the test tokens like real ones.
- A stand-in for SpiceDB allows only the permissions that the test lists. Every other permission check fails.
- `machineHeaders` makes a request look like it comes from an allowed internal service. Using `offlineResourceId` as a resource ID makes the permission check fail as if SpiceDB were down.
- `runProcess` starts the current program as a separate process and returns its exit code and output.
- `/evlog-disabled` turns logging off in tests. Most package `test` scripts load it first.

## Architecture

### Overview

A test grants relations as strings of the form `<subject> <permission> <type>:<id>`. The Feedback authorship test grants read and create on one project and sends a user token:

```ts
import { useStrictAuthentication } from "@spark-workflow/test-support/strict-auth"

const authentication = await useStrictAuthentication([
	`${callerSubject} read project:${projectId}`,
	`${callerSubject} create project:${projectId}`,
])

const response = await app.handle(
	new Request(`http://localhost${path}`, {
		method,
		headers: {
			...(await authentication.userToken(callerSubject, ["user"])),
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
	}),
)

afterAll(() => authentication.stop())
```

Call `useStrictAuthentication` before importing the code that creates the authentication client, because it sets `AUTH_MODE`, `AUTH_BASE_URL`, `AUTH_REALM`, `AUTH_AUDIENCE`, and the SpiceDB and machine identity settings. Run the tests with Bun's `--isolate` option and call `stop()` to close the JWKS server.

### Components

| Export | Purpose |
| --- | --- |
| `useStrictAuthentication` (from `/strict-auth`) | Starts the local key server and the SpiceDB stand-in, and returns `userToken` and `stop` |
| `machineHeaders`, `machineSubject` | Headers and subject of the allowed test service |
| `offlineResourceId` | Resource ID that simulates a SpiceDB outage |
| `runProcess` | Runs the current executable and returns `{ exitCode, stdout, stderr }` |
| `/evlog-disabled` | Preload that turns logging off |

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the workspace through the [root setup guide](../../README.md#getting-started). Add the package as a development dependency of the package under test.

### Environment Variables

`useStrictAuthentication` sets the authentication variables listed above for the test process. `runProcess` passes the caller's environment on and accepts overrides.

### Running the Module / Service

Nothing runs on its own. The fixtures run inside the tests of the packages that use them.

## Testing

From this directory:

```sh
pnpm typecheck
```

Run a consuming package's `pnpm test` to exercise the fixtures.
