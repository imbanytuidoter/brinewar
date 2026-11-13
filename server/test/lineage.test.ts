import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Store } from "../src/lib/db.js";
import { bindLineage, LineageError } from "../src/lib/lineage.js";
import { FakeViewer } from "./fakes.js";

const chainWithFirstGameAt = (block: number | null) => new FakeViewer((method) => (method === "get_game" ? (block === null ? null : { created_block: block }) : null));

describe("database lineage", () => {
  it("binds a fresh database to the deployment and accepts it again after a restart", async () => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), "bw-")), "db.sqlite"));
    await bindLineage(store, chainWithFirstGameAt(100), "brinewar.testnet");
    await expect(bindLineage(store, chainWithFirstGameAt(100), "brinewar.testnet")).resolves.toBeUndefined();
  });

  it("refuses a database left from a reset contract, so old boards never sit under new game ids", async () => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), "bw-")), "db.sqlite"));
    await bindLineage(store, chainWithFirstGameAt(100), "brinewar.testnet");
    await expect(bindLineage(store, chainWithFirstGameAt(900), "brinewar.testnet")).rejects.toBeInstanceOf(LineageError);
  });

  it("waits for the first game before binding", async () => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), "bw-")), "db.sqlite"));
    await bindLineage(store, chainWithFirstGameAt(null), "brinewar.testnet");
    await bindLineage(store, chainWithFirstGameAt(5), "brinewar.testnet");
    await expect(bindLineage(store, chainWithFirstGameAt(6), "brinewar.testnet")).rejects.toBeInstanceOf(LineageError);
  });
});
