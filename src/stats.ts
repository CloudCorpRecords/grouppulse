/**
 * grouppulse core: three tools over the Limzo public
 * API (read-only public Telegram group statistics).
 *
 * Shared rules, as documented in the spec:
 * - No API key and no account: every endpoint is
 *   public, so no credential is ever attached.
 * - The base URL defaults to `https://limzo.com` and
 *   is overridable via env `LIMZO_BASE_URL` (trailing
 *   slash stripped), or the injectable deps in tests.
 * - Only the arguments that are set are sent as query
 *   parameters. The MCP argument names are labelled
 *   reconstructions mapped onto the pinned wire
 *   parameters: `query` -> `q`, `language` -> `lang`,
 *   `limit` -> `limit`, `range` -> `range`.
 * - The `slug` path segment is URL-encoded.
 * - A 2xx call returns the upstream body as text,
 *   passed through verbatim. The upstream payload
 *   never includes verbatim member messages, and that
 *   property is inherited by this pass-through.
 * - Any non-2xx upstream response fails with
 *   `grouppulse error: HTTP <status>`; a throwing or
 *   timed-out fetch fails with
 *   `grouppulse error: unreachable`. Both strings are
 *   this rebuild's own (labelled).
 * - The per-request timeout defaults to 30000 ms and
 *   can be overridden through deps.
 * - Upstream access goes through the injectable fetch
 *   in deps, so tests run against a fake fetch only.
 *
 * Wires (pinned by the vendor OpenAPI document):
 * GET `<base>/api/public/groups` with `q` / `lang` /
 * `limit` when set; GET `<base>/api/public/<slug>`
 * with `range` when set; GET
 * `<base>/api/public/global-stats`.
 */
import type {
  FetchFn,
  FetchResponseLike,
  GetGroupStatsArgs,
  GroupPulseDeps,
  ListGroupsArgs,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_BASE_URL = "https://limzo.com";

export const DEFAULT_TIMEOUT_MS = 30000;

/** The stats windows the vendor OpenAPI allows for `range`. */
export const RANGES = ["7d", "30d", "all"] as const;

function envOf(deps: GroupPulseDeps): Record<string, string | undefined> {
  return deps.env ?? process.env;
}

function baseUrl(deps: GroupPulseDeps): string {
  if (deps.baseUrl && deps.baseUrl.trim() !== "") {
    return deps.baseUrl.trim().replace(/\/+$/, "");
  }
  const raw = envOf(deps).LIMZO_BASE_URL;
  const base = raw && raw.trim() !== "" ? raw.trim() : DEFAULT_BASE_URL;
  return base.replace(/\/+$/, "");
}

async function defaultFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<FetchResponseLike> {
  return fetch(url, init);
}

function fetchFn(deps: GroupPulseDeps): FetchFn {
  return deps.fetchFn ?? defaultFetch;
}

function timeoutMs(deps: GroupPulseDeps): number {
  return deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function optionalStringParam(
  params: URLSearchParams,
  wireName: string,
  value: unknown,
  argName: string,
): void {
  if (value === undefined) return;
  if (typeof value !== "string") throw new Error(`${argName} must be a string`);
  params.set(wireName, value);
}

function optionalIntegerParam(
  params: URLSearchParams,
  wireName: string,
  value: unknown,
  argName: string,
): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${argName} must be an integer`);
  }
  params.set(wireName, String(value));
}

function withQuery(path: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs === "" ? path : `${path}?${qs}`;
}

/**
 * Run one GET against the API and apply the shared
 * result rules: a 2xx body passes through verbatim;
 * any other status fails with
 * `grouppulse error: HTTP <status>`; a throwing or
 * timed-out fetch fails with
 * `grouppulse error: unreachable`.
 */
async function callApi(deps: GroupPulseDeps, path: string): Promise<string> {
  const url = `${baseUrl(deps)}${path}`;
  const ms = timeoutMs(deps);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("request timed out"));
    }, ms);
  });
  let res: FetchResponseLike;
  try {
    res = await Promise.race([
      fetchFn(deps)(url, { method: "GET", headers: {}, signal: controller.signal }),
      timeout,
    ]);
  } catch {
    throw new Error("grouppulse error: unreachable");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  const body = await res.text();
  if (res.status >= 200 && res.status < 300) return body;
  throw new Error(`grouppulse error: HTTP ${res.status}`);
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

/**
 * Search or browse the public group directory.
 * Wire: GET <base>/api/public/groups with only the
 * set arguments as query parameters — `query` sent
 * as `q`, `language` sent as `lang`, `limit` sent as
 * `limit`.
 */
export async function listGroups(
  args: ListGroupsArgs,
  deps: GroupPulseDeps = {},
): Promise<string> {
  const a = (args ?? {}) as unknown as Record<string, unknown>;
  const params = new URLSearchParams();
  optionalStringParam(params, "q", a.query, "query");
  optionalStringParam(params, "lang", a.language, "language");
  optionalIntegerParam(params, "limit", a.limit, "limit");
  return callApi(deps, withQuery("/api/public/groups", params));
}

/**
 * Full public stats for one group, by slug.
 * Wire: GET <base>/api/public/<slug> with `range`
 * when set; the slug path segment is URL-encoded.
 * `range` must be one of the pinned windows
 * ("7d", "30d", "all") when given.
 */
export async function getGroupStats(
  args: GetGroupStatsArgs,
  deps: GroupPulseDeps = {},
): Promise<string> {
  const a = (args ?? {}) as unknown as Record<string, unknown>;
  const slug = requireNonEmptyString(a.slug, "slug");
  const params = new URLSearchParams();
  if (a.range !== undefined) {
    if (typeof a.range !== "string" || !(RANGES as readonly string[]).includes(a.range)) {
      throw new Error(`range must be one of: ${RANGES.join(", ")}`);
    }
    params.set("range", a.range);
  }
  return callApi(
    deps,
    withQuery(`/api/public/${encodeURIComponent(slug)}`, params),
  );
}

/**
 * Network-wide totals across all public groups.
 * Wire: GET <base>/api/public/global-stats.
 */
export async function getGlobalStats(deps: GroupPulseDeps = {}): Promise<string> {
  return callApi(deps, "/api/public/global-stats");
}
