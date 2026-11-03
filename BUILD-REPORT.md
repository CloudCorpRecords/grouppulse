# grouppulse — Build Report (Batch 26)

Rebuild of the `com.limzo/telegram-group-stats` MCP server
(v1.3.1, npm package `limzo-mcp`) from the firsthand spec
in `specs-batch26/grouppulse.md`. Built 2026-10-27.

## Identity

- npm: `@reneturcios/grouppulse` @ 0.1.0, bin
  `grouppulse` → `dist/cli.js`
- MCP Registry name: `io.github.CloudCorpRecords/grouppulse`
  (matches `package.json` `mcpName`, `server.json` `name`,
  and the Dockerfile `io.modelcontextprotocol.server.name`
  label — all verified)
- server.json description (100 chars, measured and
  verified): "Read-only public Telegram group
  statistics: leaderboards, activity trends, levels and
  award history." — exactly the string the spec's
  Factory notes give.
- server.json: npm package entry carries
  `"version": "0.1.0"`; the OCI entry
  (`ghcr.io/cloudcorprecords/grouppulse:0.1.0`) carries
  **no** `version` field (verified).

## Files (19-file factory set, per TEMPLATE.md §2)

package.json, server.json, Dockerfile, tsconfig.json
(byte-identical to builds/signalfeed/tsconfig.json,
verified with `cmp`), .gitignore, .dockerignore,
package-lock.json, README.md (fresh prose), LICENSE
(MIT, © 2026 Rene Turcios), CHANGELOG.md (single 0.1.0
entry dated 2026-10-27), src/index.ts, src/cli.ts,
src/mcp.ts, src/types.ts, src/stats.ts (core),
test/stats.test.ts, and the four workflows under
.github/workflows/ (publish-container adapted: IMAGE
ghcr.io/cloudcorprecords/grouppulse, smoke assertion
on server name `grouppulse`). Plus this
BUILD-REPORT.md and the parity-out/ artifacts. The
parity fixture lives at
`harness/fixtures/limzo-tools-original.json`.

## Tools (3)

- `list_groups` — search/browse the public group
  directory (slug, title, members, language). Optional
  arguments `query`, `language`, `limit`.
- `get_group_stats` — full public stats for one group
  by `slug` (required): activity, top members, levels,
  awards, moderation summary. Optional `range`, one of
  `7d` / `30d` / `all` (the pinned OpenAPI enum).
- `get_global_stats` — network-wide Limzo stats. No
  arguments.

## Implementation

- `src/mcp.ts`: low-level `Server` API
  (`sdk/server/index.js` + `StdioServerTransport`,
  handlers for `ListToolsRequestSchema` /
  `CallToolRequestSchema` from `sdk/types.js`),
  explicit JSON-schema literals for all three tools;
  no McpServer/zod registration. Tool descriptions and
  input schemas are the fixture's, exactly.
- `src/stats.ts`: `VERSION = "0.1.0"`. Keyless client:
  no credential exists or is ever attached. All
  upstream access goes through an injectable fetch
  (deps `fetchFn`, `env`, `baseUrl`, `timeoutMs`).
  Base URL defaults to `https://limzo.com`,
  overridable via `LIMZO_BASE_URL` (trailing slash
  stripped) or deps. Only set arguments are sent as
  query parameters; the `slug` path segment is
  URL-encoded. A 2xx returns the upstream body text
  verbatim. Non-2xx → `grouppulse error: HTTP
  <status>`; a throwing or timed-out fetch →
  `grouppulse error: unreachable` (both strings are
  this rebuild's own, per the spec's labelling of the
  `grouppulse error:` family). The per-request
  timeout defaults to 30000 ms and is enforced with
  an AbortController plus a timeout race so an
  injected fetch that never answers still times out
  in tests. `range` outside the pinned windows and a
  missing/empty `slug` fail locally before any fetch.
- Worked example: the spec's pinned `hipo` payload
  shape (`group` / `range` / `stats` with `messages`,
  `active_users`, `mood`, `top_members`) is used as
  the pass-through fixture in the test suite; the
  body returns byte-for-byte as the fake fetch served
  it. The upstream never exposes verbatim member
  messages (pinned property), inherited by the
  pass-through.
- CLI: one subcommand per tool taking a JSON argument
  string, `mcp`, `--version` / `-v` (prints `0.1.0`);
  unknown subcommand → usage on stderr, exit 2; tool
  errors exit 1 (verified against the built CLI and
  through the tsx-spawned CLI tests).

## Endpoint provenance (pinned vs reconstructed)

OpenAPI-pinned (vendor document saved beside the
spec, `specs-batch26/limzo-openapi.json`):

- All wire paths: GET `<base>/api/public/groups`
  (list_groups); GET `<base>/api/public/<slug>`
  (get_group_stats — the OpenAPI also lists
  `/s/<slug>.json` with the same parameters; the spec
  pins the `/api/public/` path as the API route);
  GET `<base>/api/public/global-stats`
  (get_global_stats).
- The wire parameter names `q`, `lang`, `limit`,
  `range`; the `range` enum `7d` / `30d` / `all` with
  default `7d`; the limit bounds (1–50, default 20)
  documented upstream; the error statuses (403 page
  disabled, 404 unknown slug, 410 stats deleted, 429
  rate limited at 5 requests/second).

Labelled reconstructions (per the spec, also labelled
in README.md and in the fixture's `_source`):

- The MCP-layer argument names beyond `slug`:
  `query` → `q`, `language` → `lang`, `limit` →
  `limit`, `range` → `range`.
- The error strings `grouppulse error: HTTP <status>`
  and `grouppulse error: unreachable`, and the local
  argument-validation strings, are this rebuild's own.
- Tool descriptions are written fresh for this
  rebuild from the spec's surface table.

## Verification (all real, run 2026-10-27)

- `tsc` (via a symlinked sibling `node_modules` from
  builds/signalfeed, removed afterwards): exit 0,
  real emit into `dist/` (cli/stats/mcp/types/index
  `.js` + `.d.ts` + maps).
- `npm test`: **31 tests, 31 pass, 0 fail** — fake
  fetch and injected env only, no live network (the
  CLI tests spawn the CLI through tsx and exercise
  pre-request paths only). Covers every wire path and
  query construction (no-query default, all-three-
  argument mapping asserted exactly, only-set-args,
  query URL-encoding), the spec's `hipo` worked-
  example shape passed through verbatim plus a
  non-canonical JSON string returned unreserialised,
  base-URL env override with trailing-slash stripping
  and deps-over-env precedence, each pinned `range`
  value, slug URL-encoding, local validation failures
  with zero fetches (empty/missing slug, bad range,
  non-integer limit, non-string query), the HTTP-error
  mapping (403 / 404 / 410 / 429 / 500), the
  unreachable mapping for a throwing fetch and for a
  never-answering fetch past an overridden 25 ms
  timeout, and the CLI cases (`--version` and `-v`
  exit 0, unknown subcommand / non-JSON argument /
  JSON-array argument / extra arguments exit 2,
  missing slug exit 1).
- `node dist/cli.js --version`: prints `0.1.0`, exit 0.
- Parity: tools captured by sending initialize +
  notifications/initialized + tools/list to
  `node dist/cli.js mcp` over stdio into
  `parity-out/tools-rebuild.json`, then
  `harness/parity.py` against
  `harness/fixtures/limzo-tools-original.json`
  → **PASS, parity 100.0, identical_tools 3 / total 3**
  (see `parity-out/parity.json`).
- Lockfile: generated in a TEMP dir from this
  package.json alone via
  `npm install --package-lock-only --ignore-scripts
  --offline`; verified it parses, `name` ==
  `@reneturcios/grouppulse`, **128 package entries**;
  then placed in the build dir and re-verified (md5
  `8ce96b3ee49ad7b7a9e7a611a6bc3273` identical in both
  places, parses, same name and entry count).
- Version consistency: `package.json` 0.1.0 =
  `server.json` top-level 0.1.0 = npm entry 0.1.0 =
  OCI tag `:0.1.0` = core `VERSION` 0.1.0 = CHANGELOG
  heading `## 0.1.0 (2026-10-27)`.

## Spec conflicts

- None found. The task brief and the spec agree on
  the tool set, the wires, the description string and
  the lockfile entry count (128, matched).

## Gaps

- Live upstream behaviour is unproven: no live call
  was made anywhere (tests are fake-fetch only), per
  the standing build rules.
- The MCP-layer argument names beyond `slug` are
  labelled reconstructions mapped onto the pinned
  OpenAPI query parameters, per the spec; the
  original MCP layer's own argument names are
  unpublished.
- The registry-listed original repo was not read
  (per the spec, the GitHub route was degraded); the
  spec, the npm README it cites and the vendor
  OpenAPI are the sole authorities used.
