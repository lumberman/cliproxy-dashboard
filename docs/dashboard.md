# CLI Proxy Console

This fork adds a dashboard to CLIProxyAPI.
The interface follows the supplied quota ledger reference.
The proxy server keeps its upstream behavior.

## Requirements

- Node.js 24 or later.
- Bun 1.3.14.
- CLIProxyAPI v8, or Go 1.26 to build the server.

## Build the dashboard

```bash
cd dashboard
bun install --frozen-lockfile
bun run verify
cd ..
```

The build creates `dashboard/dist/index.html`.
The file includes all scripts, styles, and assets.
The dashboard keeps the upstream MIT license in `dashboard/LICENSE`.
See `dashboard/UPSTREAM.md` for its source revision.

## Run a separate local instance

```bash
bash scripts/dashboard-run.sh
```

Open `http://127.0.0.1:8318/management.html#/quota`.
Use the key in `.dashboard-runtime/management-key` at the login screen.
The script creates a local configuration and a separate credential directory.
It leaves the existing service on port 8317 intact.
Use OAuth Login or Auth Files to add provider credentials.
The script uses the installed `cli-proxy-api` binary.
To use a local server build, put its directory first on `PATH`.

```bash
mkdir -p bin
go build -o bin/cli-proxy-api ./cmd/server
PATH="$PWD/bin:$PATH" bash scripts/dashboard-run.sh
```

Stop the local instance with Ctrl+C.
The script retains its configuration and credentials for the next start.
Keep `.dashboard-runtime/` private.
The repository excludes this directory.

## Install into an existing instance

See [deployment and API coverage](dashboard-api.md).
The install script requires `--force` before it replaces a different panel file.
Set `management.disable-auto-update-panel: true` to retain this dashboard.

## Dashboard functions

- The usage dashboard shows traffic, credential state, and runtime settings.
- AI Providers manages upstream API keys, model aliases, priorities, and policies.
- Auth Files manages credential files, token refresh, status, routing fields, and cooldowns.
- OAuth Login supports all built-in v8 provider flows and plugin flows.
- Quota Management shows provider summaries and account quota windows.
- The ledger masks account emails by default.
- Cards, search, sort, provider filters, and per-account refresh remain available.
- Request tools sends explicit HTTP requests through the management API.
- Request tools can retrieve usage queue records after confirmation.
- Logs Viewer shows server logs and provides request/error log downloads.
- Config Panel includes visual and YAML editors.
- Plugins and Plugin Store use the server capability signal.

Quota data comes from provider responses.
An unknown quota remains unknown.
The dashboard does not infer a quota from CLI session token counts.
A provider can require a separate sign-in or plan.

## Development

```bash
cd dashboard
bun run dev -- --host 127.0.0.1
```

At login, select the custom connection URL.
Enter the address of a v8 server and its management key.
Use the management key, not a client API key.

## Validation

```bash
cd dashboard
bun run verify
cd ..
bash scripts/dashboard-test.sh
```

The CI workflow runs these checks and stores the single-file HTML artifact.
No test sends model requests to a paid provider.

## Design

The UI review uses UI UX Pro Max with the supplied screenshot as the visual target.
The interface uses semantic theme tokens, provider icons, keyboard focus states, and responsive layouts.
See `design-qa.md` for visual and interaction evidence.
