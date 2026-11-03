import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getGlobalStats, getGroupStats, listGroups } from "../src/stats.js";
import type { FetchFn, GroupPulseDeps } from "../src/types.js";

/**
 * Every test runs against an injected fake fetch and an
 * injected env: no live network, no live call is made.
 * The CLI tests spawn the real CLI through tsx and only
 * exercise paths that fail before any request.
 */

type Captured = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

function makeFetch(
  handler: (url: string) => { status?: number; body: unknown },
  captured: Captured[] = [],
): FetchFn {
  return async (url, init) => {
    captured.push({ url, method: init?.method, headers: init?.headers, body: init?.body });
    const r = handler(url);
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
    };
  };
}

const okFetch = (body: unknown = { ok: true }, captured: Captured[] = []) =>
  makeFetch(() => ({ body }), captured);

const throwingFetch: FetchFn = async () => {
  throw new Error("connection refused");
};

function deps(fetchFn: FetchFn, extra: Partial<GroupPulseDeps> = {}): GroupPulseDeps {
  return { fetchFn, env: {}, ...extra };
}

async function expectError(promise: Promise<unknown>, message: string): Promise<void> {
  await assert.rejects(promise, (err: unknown) => {
    assert.equal(err instanceof Error ? err.message : String(err), message);
    return true;
  });
}

const DIRECTORY = {
  ok: true,
  total_matches: 1,
  groups: [
    {
      slug: "hipo",
      title: "Hipo Chat",
      username: "hipo_chat",
      member_count: 3920,
      language: { primary: "en", distinct: 2, items: [] },
    },
  ],
};

const HIPO_STATS = {
  group: { title: "Hipo Chat", username: "hipo_chat", member_count: 3920 },
  range: { key: "7d", label: "7 days", days: 7 },
  stats: {
    messages: 1107,
    active_users: 236,
    mood: { label: "Sunny", emoji: "☀️", positive_pct: 83 },
    top_members: [
      { rank: 1, name: "Josip", messages: 238 },
      { rank: 2, name: "Behrang Norouzinia", messages: 84 },
    ],
  },
};

describe("list_groups", () => {
  it("GETs <base>/api/public/groups with no query when no arguments are set", async () => {
    const captured: Captured[] = [];
    const out = await listGroups({}, deps(okFetch(DIRECTORY, captured)));
    assert.equal(out, JSON.stringify(DIRECTORY));
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, "https://limzo.com/api/public/groups");
    assert.equal(captured[0].method, "GET");
  });

  it("maps query to q, language to lang and limit to limit", async () => {
    const captured: Captured[] = [];
    await listGroups(
      { query: "hipo", language: "fa", limit: 5 },
      deps(okFetch(DIRECTORY, captured)),
    );
    assert.equal(
      captured[0].url,
      "https://limzo.com/api/public/groups?q=hipo&lang=fa&limit=5",
    );
  });

  it("sends only the arguments that are set", async () => {
    const captured: Captured[] = [];
    await listGroups({ language: "es" }, deps(okFetch(DIRECTORY, captured)));
    assert.equal(captured[0].url, "https://limzo.com/api/public/groups?lang=es");
  });

  it("URL-encodes the query value", async () => {
    const captured: Captured[] = [];
    await listGroups({ query: "a b&c" }, deps(okFetch(DIRECTORY, captured)));
    assert.equal(captured[0].url, "https://limzo.com/api/public/groups?q=a+b%26c");
  });

  it("rejects a non-integer limit before any fetch", async () => {
    const captured: Captured[] = [];
    await expectError(
      listGroups({ limit: 2.5 }, deps(okFetch(DIRECTORY, captured))),
      "limit must be an integer",
    );
    assert.deepEqual(captured, []);
  });

  it("rejects a non-string query before any fetch", async () => {
    const captured: Captured[] = [];
    await expectError(
      listGroups({ query: 7 as never }, deps(okFetch(DIRECTORY, captured))),
      "query must be a string",
    );
    assert.deepEqual(captured, []);
  });

  it("reads the base URL from env LIMZO_BASE_URL and strips its trailing slash", async () => {
    const captured: Captured[] = [];
    await listGroups(
      {},
      deps(okFetch(DIRECTORY, captured), {
        env: { LIMZO_BASE_URL: "https://limzo.example.test/root/" },
      }),
    );
    assert.equal(captured[0].url, "https://limzo.example.test/root/api/public/groups");
  });

  it("prefers an injected baseUrl over the env value", async () => {
    const captured: Captured[] = [];
    await listGroups(
      {},
      deps(okFetch(DIRECTORY, captured), {
        env: { LIMZO_BASE_URL: "https://env.example.test" },
        baseUrl: "https://deps.example.test/",
      }),
    );
    assert.equal(captured[0].url, "https://deps.example.test/api/public/groups");
  });

  it("returns a string body verbatim, without JSON re-serialisation", async () => {
    const raw = '{ "ok" : true , "groups" : [] }';
    const out = await listGroups({}, deps(okFetch(raw)));
    assert.equal(out, raw);
  });
});

describe("get_group_stats", () => {
  it("GETs <base>/api/public/<slug> and passes the worked-example shape through verbatim", async () => {
    const captured: Captured[] = [];
    const out = await getGroupStats({ slug: "hipo" }, deps(okFetch(HIPO_STATS, captured)));
    assert.equal(out, JSON.stringify(HIPO_STATS));
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, "https://limzo.com/api/public/hipo");
    assert.equal(captured[0].method, "GET");
  });

  it("sends range as the range query parameter when set", async () => {
    const captured: Captured[] = [];
    await getGroupStats({ slug: "hipo", range: "30d" }, deps(okFetch(HIPO_STATS, captured)));
    assert.equal(captured[0].url, "https://limzo.com/api/public/hipo?range=30d");
  });

  it("accepts each pinned range value", async () => {
    for (const range of ["7d", "30d", "all"]) {
      const captured: Captured[] = [];
      await getGroupStats({ slug: "hipo", range }, deps(okFetch(HIPO_STATS, captured)));
      assert.equal(captured[0].url, `https://limzo.com/api/public/hipo?range=${range}`);
    }
  });

  it("URL-encodes the slug path segment", async () => {
    const captured: Captured[] = [];
    await getGroupStats({ slug: "a b/c" }, deps(okFetch(HIPO_STATS, captured)));
    assert.equal(captured[0].url, "https://limzo.com/api/public/a%20b%2Fc");
  });

  it("rejects an empty slug before any fetch", async () => {
    const captured: Captured[] = [];
    await expectError(
      getGroupStats({ slug: "" }, deps(okFetch(HIPO_STATS, captured))),
      "slug must be a non-empty string",
    );
    assert.deepEqual(captured, []);
  });

  it("rejects a missing slug before any fetch", async () => {
    const captured: Captured[] = [];
    await expectError(
      getGroupStats({} as never, deps(okFetch(HIPO_STATS, captured))),
      "slug must be a non-empty string",
    );
    assert.deepEqual(captured, []);
  });

  it("rejects a range outside the pinned windows before any fetch", async () => {
    const captured: Captured[] = [];
    await expectError(
      getGroupStats({ slug: "hipo", range: "1y" }, deps(okFetch(HIPO_STATS, captured))),
      "range must be one of: 7d, 30d, all",
    );
    assert.deepEqual(captured, []);
  });
});

describe("get_global_stats", () => {
  it("GETs <base>/api/public/global-stats and returns the body verbatim", async () => {
    const captured: Captured[] = [];
    const body = { ok: true, stats: { public_groups: 42, messages_7d: 1000 } };
    const out = await getGlobalStats(deps(okFetch(body, captured)));
    assert.equal(out, JSON.stringify(body));
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, "https://limzo.com/api/public/global-stats");
    assert.equal(captured[0].method, "GET");
  });
});

describe("upstream errors", () => {
  it("maps a 404 reply to grouppulse error: HTTP 404", async () => {
    const fetchFn = makeFetch(() => ({ status: 404, body: { ok: false, error: "no group" } }));
    await expectError(getGroupStats({ slug: "nope" }, deps(fetchFn)), "grouppulse error: HTTP 404");
  });

  it("maps a 403 reply to grouppulse error: HTTP 403", async () => {
    const fetchFn = makeFetch(() => ({ status: 403, body: "page disabled" }));
    await expectError(getGroupStats({ slug: "hipo" }, deps(fetchFn)), "grouppulse error: HTTP 403");
  });

  it("maps a 410 reply to grouppulse error: HTTP 410", async () => {
    const fetchFn = makeFetch(() => ({ status: 410, body: "deleted" }));
    await expectError(getGroupStats({ slug: "gone" }, deps(fetchFn)), "grouppulse error: HTTP 410");
  });

  it("maps a 429 reply to grouppulse error: HTTP 429", async () => {
    const fetchFn = makeFetch(() => ({ status: 429, body: "slow down" }));
    await expectError(listGroups({}, deps(fetchFn)), "grouppulse error: HTTP 429");
    await expectError(getGlobalStats(deps(fetchFn)), "grouppulse error: HTTP 429");
  });

  it("maps a 500 reply to grouppulse error: HTTP 500", async () => {
    const fetchFn = makeFetch(() => ({ status: 500, body: "boom" }));
    await expectError(getGlobalStats(deps(fetchFn)), "grouppulse error: HTTP 500");
  });

  it("maps a throwing fetch to grouppulse error: unreachable", async () => {
    await expectError(listGroups({}, deps(throwingFetch)), "grouppulse error: unreachable");
    await expectError(getGroupStats({ slug: "hipo" }, deps(throwingFetch)), "grouppulse error: unreachable");
    await expectError(getGlobalStats(deps(throwingFetch)), "grouppulse error: unreachable");
  });

  it("maps a fetch that never answers (past the timeout) to grouppulse error: unreachable", async () => {
    const hangingFetch: FetchFn = () => new Promise(() => {});
    await expectError(
      listGroups({}, deps(hangingFetch, { timeoutMs: 25 })),
      "grouppulse error: unreachable",
    );
  });
});

/* ------------------------------------------------------------------ */
/* CLI (spawned through tsx; only pre-request paths are exercised)     */
/* ------------------------------------------------------------------ */

function runCli(args: string[], env: Record<string, string> = {}) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  return spawnSync(join(root, "node_modules", ".bin", "tsx"), ["src/cli.ts", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, LIMZO_BASE_URL: "", ...env },
  });
}

describe("grouppulse CLI", () => {
  it("prints 0.1.0 for --version and exits 0", () => {
    const res = runCli(["--version"]);
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), "0.1.0");
  });

  it("prints 0.1.0 for -v and exits 0", () => {
    const res = runCli(["-v"]);
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), "0.1.0");
  });

  it("exits 2 with usage for an unknown subcommand", () => {
    const res = runCli(["not-a-tool"]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /Usage/);
  });

  it("exits 2 for a non-JSON argument string", () => {
    const res = runCli(["list_groups", "not json"]);
    assert.equal(res.status, 2);
  });

  it("exits 2 for a JSON array argument string", () => {
    const res = runCli(["list_groups", "[]"]);
    assert.equal(res.status, 2);
  });

  it("exits 2 for extra arguments", () => {
    const res = runCli(["list_groups", "{}", "{}"]);
    assert.equal(res.status, 2);
  });

  it("exits 1 with the slug message when get_group_stats has no slug", () => {
    const res = runCli(["get_group_stats", "{}"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /slug must be a non-empty string/);
  });
});
