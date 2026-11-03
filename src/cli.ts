#!/usr/bin/env node
/**
 * grouppulse CLI.
 *
 *   grouppulse list_groups '<json>'
 *   grouppulse get_group_stats '<json>'
 *   grouppulse get_global_stats '<json>'
 *   grouppulse mcp
 *   grouppulse --version
 *
 * Each tool subcommand takes one JSON argument string
 * with the tool's arguments and prints the tool's
 * result text. Exit codes: 0 success, 1 runtime error,
 * 2 usage error.
 */
import { getGlobalStats, getGroupStats, listGroups, VERSION } from "./stats.js";

const TOOL_NAMES = ["list_groups", "get_group_stats", "get_global_stats"] as const;

function usageError(): never {
  console.error(`Usage:
  grouppulse <tool> '<json-args>'     one of: ${TOOL_NAMES.join(", ")}
  grouppulse mcp
  grouppulse --version`);
  process.exit(2);
}

async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "list_groups":
      return listGroups(args as never);
    case "get_group_stats":
      return getGroupStats(args as never);
    case "get_global_stats":
      return getGlobalStats();
    default:
      usageError();
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    if (rest.length !== 0) usageError();
    await import("./mcp.js");
    return;
  }
  if (!(TOOL_NAMES as readonly string[]).includes(cmd ?? "")) usageError();
  if (rest.length > 1) usageError();
  let args: Record<string, unknown> = {};
  if (rest.length === 1) {
    try {
      const parsed: unknown = JSON.parse(rest[0]);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) usageError();
      args = parsed as Record<string, unknown>;
    } catch {
      console.error("error: argument must be a JSON object string");
      process.exit(2);
    }
  }
  try {
    const out = await runTool(cmd, args);
    console.log(out);
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
