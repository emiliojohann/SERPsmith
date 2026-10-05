#!/usr/bin/env node
import path from "node:path";
import { reap } from "./durable-work-queue.mjs";

export async function reapSiteQueue(queueRoot, siteKey, now = new Date().toISOString()) {
  const root = path.resolve(queueRoot ?? "");
  if (!/^[a-z0-9-]+$/.test(siteKey ?? "") || root === path.parse(root).root || !root.split(path.sep).includes(siteKey)) throw new Error("bounded site queue required");
  return reap(root, now);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [root, siteKey] = process.argv.slice(2);
  const once = process.argv.includes("--once");
  let busy = false;
  const tick = async () => {
    if (busy) return true;
    busy = true;
    try {
      const result = await reapSiteQueue(root, siteKey);
      if (once) process.stdout.write(JSON.stringify(result) + "\n");
    } catch (error) {
      process.stderr.write(JSON.stringify({ adapter: "queue_lease_watch", result: "failed", detail: error.message }) + "\n");
      process.exitCode = 2;
      return false;
    } finally {
      busy = false;
    }
    return true;
  };
  if (await tick() && !once) {
    // The pending-queue stream owns dispatch. This watcher only reaps expired
    // leases and never sends a report or starts an agent turn itself.
    const timer = setInterval(async () => { if (!await tick()) clearInterval(timer); }, 15_000);
  }
}
