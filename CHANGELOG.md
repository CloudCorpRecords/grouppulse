# Changelog

## 0.1.0 (2026-10-27)

- Initial release: three MCP tools and matching CLI
  subcommands over the Limzo public API —
  `list_groups`, `get_group_stats` and
  `get_global_stats`.
- No API key or account is needed: every endpoint is
  public and read-only. The base URL defaults to
  `https://limzo.com` and can be overridden with
  `LIMZO_BASE_URL`. Upstream bodies are returned
  verbatim; non-200 replies and unreachable hosts use
  this rebuild's own `grouppulse error:` strings.
