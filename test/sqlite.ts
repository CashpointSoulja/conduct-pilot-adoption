// Test-only stand-in for the Durable Object SQLite storage API, backed by node:sqlite.
import { createRequire } from "node:module";
import type { DatabaseSync as DB } from "node:sqlite";
import type { StorageLike } from "../src/store";

// Loaded through require because the test bundler does not yet treat node:sqlite as a builtin.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export function memoryStorage(): StorageLike & { db: DB } {
  const db = new DatabaseSync(":memory:");
  let depth = 0;
  return {
    db,
    sql: {
      exec(query: string, ...binds: unknown[]) {
        const stmt = db.prepare(query);
        const rows = /^\s*select/i.test(query) ? (stmt.all(...(binds as never[])) as Record<string, unknown>[]) : (stmt.run(...(binds as never[])), []);
        return { toArray: () => rows };
      },
    },
    transactionSync<T>(fn: () => T): T {
      const sp = `sp${depth++}`;
      db.exec(`SAVEPOINT ${sp}`);
      try {
        const out = fn();
        db.exec(`RELEASE ${sp}`);
        return out;
      } catch (e) {
        db.exec(`ROLLBACK TO ${sp}`);
        db.exec(`RELEASE ${sp}`);
        throw e;
      } finally {
        depth--;
      }
    },
  };
}
