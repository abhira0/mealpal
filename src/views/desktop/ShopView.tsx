"use client";

import { useState } from "react";
import { DeskPage } from "@/components/DeskPage";
import { ShopTicket } from "@/components/ShopTicket";
import { Bill } from "@/components/Bill";
import { AddExtra } from "@/components/AddExtra";
import { centsToDollars } from "@/lib/money";
import { useShopData } from "@/views/shop-data";
import { SkeletonRows } from "@/components/Skeleton";

export function DesktopShop() {
  const s = useShopData();
  const [tab, setTab] = useState<"run" | "bill" | "history">("run");

  return (
    <DeskPage
      title="The run"
      testId="desktop-shop"
      sub={
        <>
          {s.stopCount} {s.stopCount === 1 ? "stop" : "stops"}
          {s.tripTotal > 0 && <> · ${centsToDollars(s.tripTotal).toFixed(2)}</>}
        </>
      }
    >
      <main className="stack">
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
          <Bill history />
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
              <div
                className="dash-grid"
                data-testid="dash"
                style={{ gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))" }}
              >
                {s.shops.map(([shopName, lines]) => {
                  const meta = s.shopMeta[shopName];
                  return (
                    <ShopTicket
                      key={shopName}
                      shopName={shopName}
                      website={meta?.website}
                      iconUrl={meta?.iconUrl}
                      total={s.shopTotal(lines)}
                      lines={s.toLines(lines)}
                      prices={s.prices}
                      struck={s.struck}
                      onStruck={s.handleStruck}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </DeskPage>
  );
}
