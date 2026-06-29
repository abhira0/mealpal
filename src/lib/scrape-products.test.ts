import { describe, expect, it } from "vitest";
import { parseScraped } from "./scrape-products";

describe("parseScraped", () => {
  it("pulls name, price, image, url straight through", () => {
    const r = parseScraped({
      title: "  Kirkland Signature Olive Oil  ",
      priceText: "$24.99",
      imageUrl: "https://img/x.jpg",
      url: "https://www.costco.com/x.product.100.html",
    });
    expect(r.name).toBe("Kirkland Signature Olive Oil");
    expect(r.dollars).toBe(24.99);
    expect(r.imageUrl).toBe("https://img/x.jpg");
    expect(r.url).toBe("https://www.costco.com/x.product.100.html");
  });

  it("strips currency commas and stray text from price", () => {
    expect(parseScraped({ priceText: "Your Price: $1,299.00 each" }).dollars).toBe(1299);
  });

  it("normalizes kg and l to base g/ml", () => {
    expect(parseScraped({ weightText: "1.36 kg" })).toMatchObject({ packSize: 1360, unit: "g" });
    expect(parseScraped({ weightText: "2 L" })).toMatchObject({ packSize: 2000, unit: "ml" });
  });

  it("keeps g, ml, oz; converts lb to oz; ct/pack to count", () => {
    expect(parseScraped({ weightText: "500 g" })).toMatchObject({ packSize: 500, unit: "g" });
    expect(parseScraped({ weightText: "48 oz" })).toMatchObject({ packSize: 48, unit: "oz" });
    expect(parseScraped({ weightText: "2 lb" })).toMatchObject({ packSize: 32, unit: "oz" });
    expect(parseScraped({ weightText: "30 ct" })).toMatchObject({ packSize: 30, unit: "count" });
  });

  it("converts volume units to ml", () => {
    expect(parseScraped({ weightText: "1 gallon" })).toMatchObject({ packSize: 3785, unit: "ml" });
    expect(parseScraped({ weightText: "128 fl oz" })).toMatchObject({ packSize: 3785, unit: "ml" });
    expect(parseScraped({ weightText: "1 qt" })).toMatchObject({ packSize: 946, unit: "ml" });
  });

  it("takes the first weight when several appear", () => {
    expect(parseScraped({ weightText: "1.36 kg (48 oz)" })).toMatchObject({ packSize: 1360, unit: "g" });
  });

  it("handles a Weee title carrying name + pack size (first weight wins)", () => {
    // SayWeee feeds og:title as both title and weightText.
    const t = "Franco Uncooked Phulka 18ct 1.31 lb";
    expect(parseScraped({ title: t, weightText: t, shopText: "Weee" }))
      .toMatchObject({ name: t, packSize: 18, unit: "count", shop: "Weee" });
  });

  it("extracts a servings count", () => {
    expect(parseScraped({ servingsText: "About 20 servings per container" }).servings).toBe(20);
  });

  it("returns nulls for missing/unparseable fields", () => {
    expect(parseScraped({})).toEqual({
      name: null, dollars: null, imageUrl: null, packSize: null, unit: null, servings: null, shop: null, url: null,
    });
    expect(parseScraped({ priceText: "call for price", weightText: "n/a" }))
      .toMatchObject({ dollars: null, packSize: null, unit: null });
  });
});
