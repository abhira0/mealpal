"use client";

import { useEffect, useState } from "react";
import { ShopTicket } from "@/components/ShopTicket";
import { Bill } from "@/components/Bill";
import { AddExtra } from "@/components/AddExtra";
import { centsToDollars } from "@/lib/money";
import { useShopData } from "@/views/shop-data";
import { SkeletonRows } from "@/components/Skeleton";
import { consumePendingCmdkAction } from "@/lib/cmdk-bus";

export function MobileShop() {
  const s = useShopData();
  const [tab, setTab] = useState<"run" | "bill" | "history">("run");
  // Command palette "New purchase" (mealpal-d3f): jump to History and open
  // the existing AddPurchase sheet there.
  const [purchaseSignal, setPurchaseSignal] = useState(0);
  useEffect(() => {
    return consumePendingCmdkAction((action) => {
      if (action.type === "new-purchase") {
        setTab("history");
        setPurchaseSignal((n) => n + 1);
      }
    });
  }, []);

  return (
    <div data-testid="mobile-shop">
      <header className="chrome">
        <h1>The run</h1>
        <p style={{ color: "var(--ink-2)", fontSize: 14, marginTop: 2 }}>
          {s.stopCount} {s.stopCount === 1 ? "stop" : "stops"}
          {s.tripTotal > 0 && <> · ${centsToDollars(s.tripTotal).toFixed(2)}</>}
        </p>
      </header>

      <main className="content stack">
        <div className="tabs">
          <button type="button" onClick={() => setTab("run")} aria-pressed={tab === "run"}>
            Stops
          </button>
          <button type="button" onClick={() => setTab("bill")} aria-pressed={tab === "bill"}>
            Bill{s.pendingCount > 0 && <> · {s.pendingCount}</>}
          </button>
          <button type="button" onClick={() => setTab("history")} aria-pressed={tab === "history"}>
            History
          </button>
        </div>

        {tab === "bill" ? (
          <Bill onCount={s.setPendingCount} />
        ) : tab === "history" ? (
          <Bill history purchaseSignal={purchaseSignal} />
        ) : (
          <>
            <div className="filter">
              <span className="lbl">Buy ahead</span>
              {[7, 14, 30, 60, 90].map((d) => (
                <button key={d} type="button" onClick={() => s.setHorizon(d)} aria-pressed={s.horizon === d}>
                  {d}d
                </button>
              ))}
            </div>

            {s.error && <p className="notice" role="alert">{s.error}</p>}

            {s.data === null && !s.error && (
              <div aria-busy="true" aria-label="Loading shopping list">
                <SkeletonRows count={3} height={120} gap={16} />
              </div>
            )}

            {s.data && s.shops.length === 0 && (
              <p className="empty">Nothing to buy — plan some meals first.</p>
            )}

            <AddExtra
              products={s.products}
              shops={Object.values(s.shopMeta)}
              onAdded={s.loadShopping}
            />

            {s.shops.length > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="search"
                  className="input"
                  aria-label="Search shopping list"
                  placeholder="Search ingredients or products…"
                  value={s.query}
                  onChange={(e) => s.setQuery(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn"
                  style={{ flex: "0 0 auto" }}
                  onClick={() => s.setSort(s.sort === "shop" ? "cost" : "shop")}
                >
                  Sort: {s.sort === "shop" ? "Shop" : "Cost"}
                </button>
              </div>
            )}

            {s.shops.length > 0 && s.shownShops.length === 0 && (
              <p className="empty">No items match your search.</p>
            )}

            {s.shownShops.map(([key, group]) => {
              const meta = group.shopId != null ? s.shopMeta[group.shopId] : undefined;
              return (
                <ShopTicket
                  key={key}
                  shopName={group.shopName}
                  website={meta?.website}
                  iconUrl={meta?.iconUrl}
                  total={s.shopTotal(group.lines)}
                  lines={s.toLines(group.lines)}
                  prices={s.prices}
                  struck={s.struck}
                  onStruck={s.handleStruck}
                />
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
