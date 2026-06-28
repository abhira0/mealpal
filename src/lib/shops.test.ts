import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedHousehold } from "@/test/fixtures";
import {
  createShop,
  listShops,
  createBranch,
  listBranches,
} from "@/lib/shops";

let db: TestDb;
let hid: number;
beforeEach(() => {
  db = makeTestDb();
  hid = seedHousehold(db);
});

describe("shops & branches", () => {
  it("creates and lists shops scoped to a household", () => {
    createShop(db, hid, "Costco");
    const other = seedHousehold(db, "Other");
    createShop(db, other, "Walmart");
    const mine = listShops(db, hid);
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe("Costco");
  });

  it("creates branches under a shop and lists them by shop", () => {
    const shop = createShop(db, hid, "Costco");
    createBranch(db, hid, shop.id, "Seattle");
    createBranch(db, hid, shop.id, "Kirkland");
    const branches = listBranches(db, hid, shop.id);
    expect(branches.map((b) => b.name).sort()).toEqual(["Kirkland", "Seattle"]);
  });

  it("does not list another household's shops", () => {
    const other = seedHousehold(db, "Other");
    createShop(db, other, "Target");
    expect(listShops(db, hid)).toHaveLength(0);
  });
});
