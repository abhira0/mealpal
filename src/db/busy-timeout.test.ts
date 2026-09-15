import { describe, it, expect, afterEach } from "vitest";
import { Worker } from "node:worker_threads";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sqlite } from "@/db";

describe("connection pragmas", () => {
  it("sets busy_timeout to 5000ms at connection open", () => {
    expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(5000);
  });
});

// Worker source run on a real OS thread so it can hold a write lock while the
// main thread races a second connection against it — the only way to prove
// busy_timeout actually makes a second writer wait instead of failing
// instantly, since better-sqlite3 calls block the JS event loop.
const workerSource = `
  const { workerData } = require("node:worker_threads");
  const Database = require("better-sqlite3");
  const db = new Database(workerData.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec("BEGIN IMMEDIATE");
  db.prepare("INSERT INTO t (v) VALUES (1)").run();
  Atomics.store(workerData.flags, 0, 1);
  Atomics.notify(workerData.flags, 0);
  // Hold the write lock for a bit before releasing it.
  Atomics.wait(workerData.flags, 1, 0, workerData.holdMs);
  db.exec("COMMIT");
  db.close();
`;

function makeTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "busy-timeout-test-"));
  return path.join(dir, "test.db");
}

describe("concurrent writers", () => {
  let dbPath: string | undefined;

  afterEach(() => {
    if (dbPath) fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    dbPath = undefined;
  });

  it("second writer succeeds (waits out the lock) when busy_timeout is set", async () => {
    dbPath = makeTempDbPath();
    const Database = (await import("better-sqlite3")).default;
    const setup = new Database(dbPath);
    setup.pragma("journal_mode = WAL");
    setup.exec("CREATE TABLE t (v INTEGER)");
    setup.close();

    const flags = new Int32Array(new SharedArrayBuffer(8));
    const holdMs = 200;
    const worker = new Worker(workerSource, { eval: true, workerData: { dbPath, flags, holdMs } });
    const workerDone = new Promise<void>((resolve, reject) => {
      worker.on("exit", () => resolve());
      worker.on("error", reject);
    });

    // Wait for the worker to actually hold the write lock.
    Atomics.wait(flags, 0, 0, 2000);
    expect(Atomics.load(flags, 0)).toBe(1);

    const second = new Database(dbPath);
    second.pragma("busy_timeout = 5000");
    const start = Date.now();
    second.prepare("INSERT INTO t (v) VALUES (2)").run();
    const elapsed = Date.now() - start;
    second.close();

    // Let the worker proceed to commit and finish.
    Atomics.store(flags, 1, 1);
    Atomics.notify(flags, 1);
    await workerDone;

    // It had to actually wait out (most of) the hold, not fail instantly.
    expect(elapsed).toBeGreaterThanOrEqual(holdMs - 50);
  });

  it("second writer fails immediately with SQLITE_BUSY when busy_timeout is 0", async () => {
    dbPath = makeTempDbPath();
    const Database = (await import("better-sqlite3")).default;
    const setup = new Database(dbPath);
    setup.pragma("journal_mode = WAL");
    setup.exec("CREATE TABLE t (v INTEGER)");
    setup.close();

    const flags = new Int32Array(new SharedArrayBuffer(8));
    const holdMs = 200;
    const worker = new Worker(workerSource, { eval: true, workerData: { dbPath, flags, holdMs } });
    const workerDone = new Promise<void>((resolve, reject) => {
      worker.on("exit", () => resolve());
      worker.on("error", reject);
    });

    Atomics.wait(flags, 0, 0, 2000);
    expect(Atomics.load(flags, 0)).toBe(1);

    // better-sqlite3 itself defaults new connections to a 5000ms busy_timeout,
    // so to reproduce the pre-fix behavior (no busy_timeout set on our
    // connection) we have to explicitly zero it out here.
    const second = new Database(dbPath);
    second.pragma("busy_timeout = 0");
    let error: unknown;
    try {
      second.prepare("INSERT INTO t (v) VALUES (2)").run();
    } catch (e) {
      error = e;
    }
    expect((error as { code?: string } | undefined)?.code).toBe("SQLITE_BUSY");
    second.close();

    Atomics.store(flags, 1, 1);
    Atomics.notify(flags, 1);
    await workerDone;
  });
});
