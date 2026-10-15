# Dashboard deployment and API coverage

The dashboard uses the existing CLIProxyAPI server and its `/v8/management` API.
This integration changes no Go handlers, provider executors, or proxy routes.
The source reference is `internal/api/server_management_v8.go`.
The [v8 API reference](management-api-v8.md) defines configuration values and request bodies.

## Build and install

1. Build the frontend from `dashboard/` with `bun install --frozen-lockfile` and `bun run build`.
2. Set the following values in the server configuration before server startup.

```yaml
management:
  secret-key: "your-management-key"
  disable-control-panel: false
  disable-auto-update-panel: true
```

Keep your other configuration values.
The install script does not edit the configuration or start the server.

3. Install the dashboard from the repository root.

```bash
bash scripts/dashboard-install.sh --config /path/to/config.yaml
```

The script copies `dashboard/dist/index.html` to `static/management.html` beside the configuration file.
It accepts `dashboard/dist/management.html` when `index.html` does not exist.
The Vite configuration includes scripts and styles in one HTML file.
The server route requires this format because it serves only the panel HTML file.

4. Start the server with the same configuration path.
5. Open `http://127.0.0.1:8317/management.html`.
6. Enter the server address and management key.

The script leaves an identical file intact.
It rejects a different existing file until you specify `--force`.
It copies to a temporary file beside the destination, then renames that file.
It removes its temporary file after an error.
Use `--source FILE` to install an HTML build from another location.

The destination follows the server path rules, in this order:

| Selection | Destination |
| --- | --- |
| `--output FILE` | The explicit file path; this option only affects the script. |
| `MANAGEMENT_STATIC_PATH` | The specified directory plus `management.html`, or the specified `management.html` file. |
| `WRITABLE_PATH`, then `writable_path` | `static/management.html` inside the specified directory. |
| `--config PATH` | `static/management.html` beside the configuration file, or inside the specified configuration directory. |
| No options or environment overrides | `static/management.html` in this repository. |

Use the same environment overrides for the script and server.
Use `MANAGEMENT_STATIC_PATH` on the server when `--output` selects a different location.
The server trims whitespace from environment path values.
The script follows this rule.

`disable-auto-update-panel: true` prevents periodic upstream panel replacement.
A missing file still triggers the upstream download when a user opens `/management.html`.
Install the custom file before server startup to avoid that fallback.
`disable-control-panel: true` hides the panel route.
Home mode hides the local panel and both management API versions.

Run the isolated deployment tests with:

```bash
bash scripts/dashboard-test.sh
```

The tests use temporary HTML fixtures.
They check path precedence, existing files, explicit replacement, symlinks, and configuration preservation.

## Access and connection

The frontend API base is `/v8/management`.
The API client adds `Authorization: Bearer <management-key>` to management requests.
The backend also accepts `X-Management-Key`.
The server requires a management key for local and remote API requests.
Remote requests also require `management.allow-remote: true`.
OAuth callbacks validate their session state without the management header.

The dashboard address field accepts the server origin or its `/v8/management` URL.
The panel can connect to another server when that server permits remote management access.
The backend supplies the version and plugin support headers that the frontend uses.
The frontend probes `/v0/management/config` only to diagnose an older backend.
It does not use that response as application data.

## Supported API surfaces

All paths in this table use the `/v8/management` prefix.
The frontend references are under `dashboard/src/`.

| Function | Backend path and methods | Dashboard surface |
| --- | --- | --- |
| Full configuration | `GET`, `PUT`, `PATCH /config`; `GET`, `PUT /config.yaml` | Configuration page: visual fields and YAML editor. |
| Configuration fields | `GET`, `PUT`, `PATCH`, `DELETE /config/*path` | Client keys, provider groups, routing, plugins, and other configuration fields. |
| Shared provider settings | `/config/upstream/<provider>` through the configuration handler | Provider editor and YAML editor. |
| Upstream API keys | `/config/api-keys/<provider>` | Provider workbench; reads and writes the v8 provider groups. |
| Client API keys | `/config/access/api-keys` | Configuration page. |
| Credential files | `GET`, `POST`, `DELETE /credentials` | Credential list, upload, deletion, and batch actions. |
| Credential detail | `GET /credentials/models`, `GET /credentials/download` | Model list and credential export. |
| Credential changes | `PATCH /credentials/status`, `PATCH /credentials/fields`, `POST /credentials/refresh` | Enable, disable, edit, and refresh credentials. |
| OAuth | `GET /oauth/auth-url`, `GET /oauth/status`, `DELETE /oauth/session`, `GET`, `POST /oauth/callback` | Provider authorization, callback submission, status, and cancellation. |
| Vertex import | `POST /oauth/import?provider=vertex` | Vertex service account import. |
| Built-in quota | `POST /requests/api-call` | Provider quota adapters obtain upstream data through authenticated calls. |
| Plugin quota | `GET`, `POST`, `DELETE /plugins/:id/quota` | Plugin quota cards read, fetch, and reset quota. |
| Credential cooldown | `POST /routing/cooldown/reset` | Credential cooldown reset action. |
| Model definitions | `GET /routing/model-definitions/:channel` | Credential model list and model alias editor. |
| API key usage | `GET /observability/usage/api-keys` | Dashboard usage totals and recent request data. |
| Usage event queue | `GET /observability/usage/queue` | Request tools provides an explicit retrieve action and a confirmation. Records leave the server queue. |
| Application logs | `GET`, `DELETE /observability/logs` | Logs page with incremental reads and clear action. |
| Error logs | `GET /observability/logs/errors`, `GET /observability/logs/errors/:name` | Error list and download. |
| Request logs | `GET /observability/logs/requests/:id` | Request log download. |
| Plugins | `GET /plugins`, `DELETE /plugins/:id` | Plugin list and removal. |
| Plugin configuration | `/config/plugins/configs/:id` and its fields | Plugin configuration and enable controls. |
| Plugin store | `GET /plugins/store`, `POST /plugins/store/:id/install` | Store list, install, and update. |
| Latest version | `GET /server/latest-version` | System page version check. |
| Authenticated upstream call | `POST /requests/api-call` | Quota, model discovery, provider actions, and the Request tools HTTP console. |

The built-in quota adapters cover Antigravity, Claude, Codex, Devin, Kimi, Meta, and xAI.
Plugin quota depends on the quota support that each installed plugin declares.
An upstream provider can reject a quota request or omit a quota field.
The dashboard shows those states instead of supplying sample account data.

## Compatibility limits

The dashboard preserves the server API routes and all proxy protocols.
OpenAI, Gemini, Claude, Codex, WebSocket, and Amp clients continue to use the existing server routes.
The dashboard retains the CLI workflows and exposes the v8 management functions.

The `/v0/management` routes remain available with their original payloads.
The dashboard uses the current v8 contract for its application data.
V0 flat configuration setters do not belong under the v8 prefix.
V8 JSON field writes accept a direct value, rather than a `{ "value": ... }` envelope.
Successful v8 writes can migrate a legacy configuration file to the v8 layout.
Use the YAML editor for fields without a dedicated visual control.

These backend functions have no dedicated dashboard page:

- Patch arbitrary credential metadata through `/credentials/fields`; the credential editor exposes a selected set of fields.
- Change configuration fields that only the YAML editor exposes.
- Use CLI login flags, the TUI, Home operations, or storage administration.

The credential page includes single refresh, refresh all, enable controls, bulk status changes, and cooldown reset.
Its field editor includes prefix, proxy URL, priority, weight, cooling policy, headers, notes, model aliases, and request error policy.
The OAuth page includes all eight built-in providers in the v8 handler, plus enabled plugin providers and Vertex import.
The logs page includes log reads, log clear, error downloads, and request log downloads.

The CLI also supports Codex device login, SIWC binding, and a Vertex model prefix option.
The existing v8 handlers do not expose these CLI options.
Their addition to the dashboard requires an API contract change.

The backend also retains these v0-only quota operations:

| Backend path | Methods | Dashboard behavior |
| --- | --- | --- |
| `/v0/management/quota/providers` | GET | The dashboard selects its built-in adapters and declared plugin quota support. |
| `/v0/management/quota/fetch` | POST | The dashboard uses upstream calls for built-in quota and plugin quota endpoints for plugins. |
| `/v0/management/quota/reset` | POST | No generic credential quota reset control. |

The v8 server deliberately omits `/credentials/quota/providers`, `/credentials/quota/fetch`, and `/credentials/quota/reset`.
The route contract test rejects those paths in `internal/api/server_management_v8_test.go`.
Add new server behavior through the v8 contract when a future feature requires it.

Plugin-defined HTTP extensions and plugin resources keep their declared routes, which can include `/v0/management` paths.
The dashboard opens declared plugin resource pages when the backend reports plugin support.
Plugin-specific page functions depend on the installed plugin.

The Request tools page includes a general HTTP console and explicit usage queue access.
A queue retrieval removes records. Keep the page open until the result arrives.
Download the result before you leave the page.
