# grouppulse

Public Telegram group statistics, with no key to set
up. grouppulse talks to the Limzo public API, which
publishes read-only aggregate statistics for public
Telegram groups: how active a group is, who its most
active members are, how its level ladder looks, what
awards it has handed out, and a moderation summary.
Nothing here needs an account, and the upstream data
never contains verbatim member messages — only
aggregates and leaderboards — so what grouppulse
passes through inherits that property.

Three questions cover most of what the data can
answer: which public groups exist around a topic or
a language, how one particular group is doing, and
how the whole network looks in total.

## Configuration

- `LIMZO_BASE_URL` (optional) — API base URL.
  Defaults to `https://limzo.com`.

That is all. There is no API key: every endpoint is
public and read-only.

## Tools

- `list_groups` — search or browse the public group
  directory. Each entry carries its slug, title,
  member count and language. All arguments are
  optional: `query` (a keyword matched against group
  titles, usernames, slugs and descriptions),
  `language` (an ISO 639-1 code such as `fa` or
  `es`), and `limit` (how many groups to return).
  Omit everything to list the top groups.
- `get_group_stats` — full public stats for one
  group, by its `slug` (the last part of its
  `limzo.com/s/<slug>` page). The result covers
  activity, top members, levels, awards and a
  moderation summary, plus the group's mood and
  language mix when the upstream has enough signal.
  The optional `range` picks the stats window:
  `7d` (the default), `30d` or `all`; the longer
  windows need the group's paid plan upstream, and
  on a free group the answer silently falls back to
  `7d`, which you can spot in the returned `range`
  block.
- `get_global_stats` — network-wide totals across
  all public groups, plus the current top groups.

Behaviour worth knowing:

- A 2xx answer comes back exactly as the API
  returned it: nothing is trimmed, renamed or
  summarised on the way through.
- Any other reply fails with
  `grouppulse error: HTTP <status>` — for example a
  `404` for an unknown slug, a `403` when a group's
  public page is disabled, a `410` when its stats
  were deleted, or a `429` when you poll faster
  than the upstream allows (5 requests per second).
  An unreachable API fails with
  `grouppulse error: unreachable`. These error
  strings are this rebuild's own.
- The upstream asks clients to respect its cache
  headers (responses are cached for 30 minutes);
  stats move slowly, so there is rarely a reason to
  poll.

### Endpoint provenance

The vendor's published OpenAPI document pins the
endpoints, the wire parameter names and the range
values; the original MCP project's README pins the
three tools. The MCP-layer argument names are
labelled reconstructions mapped onto the pinned
wire parameters:

- `GET <base>/api/public/groups` with `q`, `lang`
  and `limit` when set (used by `list_groups`;
  the MCP arguments are `query`, `language` and
  `limit`).
- `GET <base>/api/public/{slug}` with `range` when
  set (used by `get_group_stats`; the `/s/{slug}.json`
  page route carries the same payload, and the
  `/api/public/` path is the API route).
- `GET <base>/api/public/global-stats` (used by
  `get_global_stats`).

The `slug` path segment is URL-encoded.

## CLI

Each tool is a subcommand taking one JSON argument
string:

```bash
npx @reneturcios/grouppulse list_groups '{"language":"es","limit":5}'
npx @reneturcios/grouppulse get_group_stats '{"slug":"hipo"}'
npx @reneturcios/grouppulse get_group_stats '{"slug":"hipo","range":"30d"}'
npx @reneturcios/grouppulse get_global_stats '{}'
npx @reneturcios/grouppulse --version
```

Output is the tool's result text (the upstream body
on success). Exit codes: `0` on success, `1` on a
runtime error, `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/grouppulse mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "grouppulse": {
      "command": "npx",
      "args": ["-y", "@reneturcios/grouppulse", "mcp"]
    }
  }
}
```

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/grouppulse
docker run --rm ghcr.io/cloudcorprecords/grouppulse get_global_stats '{}'
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (fake fetch only, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
