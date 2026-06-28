/**
 * Scrape an Instacart product page that's already open in a Chrome you launched
 * with --remote-debugging-port=9222 (so we reuse your logged-in session).
 *
 * Two halves: parseScraped() is pure and tested; connectAndExtract() is the
 * fragile I/O that grabs raw strings off the live page.
 */

export interface RawScrape {
  title?: string | null;
  priceText?: string | null;
  imageUrl?: string | null;
  weightText?: string | null;
  servingsText?: string | null;
  url?: string | null;
}

export interface ScrapedProduct {
  name: string | null;
  dollars: number | null;
  imageUrl: string | null;
  packSize: number | null; // normalized to `unit`
  unit: string | null; // 'g' | 'ml' | 'oz' | 'count'
  servings: number | null;
  url: string | null;
}

/** Convert a parsed weight to one of the app's canonical units. */
function normalizeWeight(amount: number, raw: string): { packSize: number; unit: string } | null {
  const u = raw.toLowerCase();
  if (u === "kg") return { packSize: amount * 1000, unit: "g" };
  if (u === "g") return { packSize: amount, unit: "g" };
  if (u === "l") return { packSize: amount * 1000, unit: "ml" };
  if (u === "ml") return { packSize: amount, unit: "ml" };
  if (u === "oz") return { packSize: amount, unit: "oz" };
  if (u === "lb") return { packSize: amount * 16, unit: "oz" };
  if (u === "ct" || u === "count" || u === "pk" || u === "pack") return { packSize: amount, unit: "count" };
  return null;
}

export function parseScraped(raw: RawScrape): ScrapedProduct {
  const name = raw.title?.trim() || null;

  const priceMatch = raw.priceText?.match(/\$?\s*([\d,]+\.?\d*)/);
  const dollars = priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : null;

  let packSize: number | null = null;
  let unit: string | null = null;
  const wMatch = raw.weightText?.match(/([\d.]+)\s*(kg|g|ml|l|oz|lb|ct|count|pk|pack)\b/i);
  if (wMatch) {
    const n = normalizeWeight(Number(wMatch[1]), wMatch[2]);
    if (n) { packSize = n.packSize; unit = n.unit; }
  }

  const sMatch = raw.servingsText?.match(/(\d+)/);
  const servings = sMatch ? Number(sMatch[1]) : null;

  return {
    name,
    dollars: dollars !== null && Number.isFinite(dollars) ? dollars : null,
    imageUrl: raw.imageUrl?.trim() || null,
    packSize,
    unit,
    servings,
    url: raw.url?.trim() || null,
  };
}

// JS evaluated *inside* the page. Instacart embeds clean JSON-LD Product data
// (name/size/price/image) — that's the source of truth. og: tags and h1 are
// stale on this SPA, so they're only a fallback when JSON-LD is absent.
// ponytail: the JSON-LD shape is the calibration knob — if Instacart drops it,
// fall back to og/body and anything missed comes back blank for the user.
const EXTRACTOR = `(() => {
  let p = null;
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const j = JSON.parse(s.textContent);
      const nodes = j['@graph'] || (Array.isArray(j) ? j : [j]);
      const prod = nodes.find((n) => n && n['@type'] === 'Product');
      if (prod) { p = prod; break; }
    } catch (e) {}
  }
  // JSON-LD's image is often a "missing-item" placeholder; the real photo is
  // the largest on-page product image, so prefer that.
  const imgEl = [...document.querySelectorAll('img')]
    .filter((i) => { const u = i.currentSrc || i.src; return u && /product-image/.test(u) && i.naturalWidth >= 200; })
    .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)[0];
  const domImg = imgEl ? (imgEl.currentSrc || imgEl.src) : null;
  if (p) {
    const ldImg = Array.isArray(p.image) ? p.image[0] : p.image;
    const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
    return {
      title: p.name || null,
      imageUrl: domImg || ldImg || null,
      priceText: offer && offer.price != null ? String(offer.price) : null,
      weightText: p.size || null,
      servingsText: null,
      url: location.href,
    };
  }
  const meta = (k) => document.querySelector('meta[property="' + k + '"]')?.getAttribute('content') ?? null;
  const body = document.body.innerText;
  return {
    title: meta('og:title'),
    imageUrl: domImg || meta('og:image'),
    priceText: (body.match(/\\$[\\d,]+\\.\\d{2}/) || [])[0] ?? null,
    weightText: (body.match(/[\\d.]+\\s*(?:kg|g|ml|l|oz|lb|ct|count|pk|pack)\\b/i) || [])[0] ?? null,
    servingsText: null,
    url: location.href,
  };
})()`;

/**
 * Find the open Instacart product tab in a Chrome started with
 * --remote-debugging-port, evaluate EXTRACTOR in it over raw DevTools
 * Protocol, and parse the result. We talk CDP directly (Node's global
 * WebSocket) because Playwright's connectOverCDP rejects a real Chrome with
 * "Browser context management is not supported".
 */
export async function connectAndExtract(
  endpoint = "http://localhost:9222",
): Promise<ScrapedProduct> {
  const res = await fetch(`${endpoint}/json`);
  const targets = (await res.json()) as { type: string; url: string; webSocketDebuggerUrl?: string }[];
  const pages = targets.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (pages.length === 0) {
    throw new Error(
      "No tabs on the debug Chrome. Launch Chrome with --remote-debugging-port=9222 AND a dedicated --user-data-dir, then open the Instacart product page in that window.",
    );
  }
  const target =
    pages.find((t) => t.url.includes("instacart.")) ?? pages[pages.length - 1];

  const ws = new WebSocket(target.webSocketDebuggerUrl!);
  try {
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("Could not open the tab's debug socket."));
    });
    const reply = await new Promise<{ result?: { result?: { value?: RawScrape } } }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Scrape timed out.")), 10_000);
      ws.onmessage = (m) => {
        const d = JSON.parse(typeof m.data === "string" ? m.data : "");
        if (d.id === 1) { clearTimeout(timer); resolve(d); }
      };
      ws.send(JSON.stringify({
        id: 1, method: "Runtime.evaluate",
        params: { expression: EXTRACTOR, returnByValue: true },
      }));
    });
    return parseScraped(reply.result?.result?.value ?? {});
  } finally {
    ws.close();
  }
}
