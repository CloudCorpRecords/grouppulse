/**
 * grouppulse types.
 *
 * Three tools wrapping the Limzo public API. The API
 * needs no key and no account: everything it serves is
 * already public. Each tool answers with the upstream
 * body passed through unchanged, as a single string;
 * failures are Errors carrying this rebuild's own
 * `grouppulse error:` strings.
 */

export interface ListGroupsArgs {
  /** Keyword for the directory search; sent as the `q` query parameter. */
  query?: string;
  /** ISO 639-1 language filter; sent as the `lang` query parameter. */
  language?: string;
  /** Maximum groups to return; sent as the `limit` query parameter. */
  limit?: number;
}

export interface GetGroupStatsArgs {
  /** The group's public slug, the last part of its limzo.com/s/<slug> URL. */
  slug: string;
  /** Stats window: "7d", "30d" or "all". Sent as the `range` query parameter. */
  range?: string;
}

/** The minimal slice of a fetch Response this client relies on. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

/** Injectable fetch, so tests never touch the live network. */
export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<FetchResponseLike>;

/** Runtime dependencies for the core, all injectable in tests. */
export interface GroupPulseDeps {
  /** Fetch implementation. Defaults to the global fetch. */
  fetchFn?: FetchFn;
  /** Environment (LIMZO_BASE_URL). Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Base URL override. Defaults to env LIMZO_BASE_URL or the default base. */
  baseUrl?: string;
  /** Per-request timeout in ms. Defaults to 30000. */
  timeoutMs?: number;
}
