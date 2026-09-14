"use client";

import { Dropdown } from "@/components/Dropdown";
import { Sheet } from "@/components/Sheet";
import { MealForm } from "@/components/MealForm";
import type { AgendaState } from "@/views/agenda-data";

/**
 * The three <Sheet>s that back the Today/Plan experience — the Add/Edit meal
 * form (MealForm), the "Which did you have?" cook-choice picker, and the
 * "Remove repeating meal" scope chooser. Rendered identically by both layouts.
 */
// `showMealSheet={false}` lets a host (the desktop Plan inspector) render the
// unified MealForm inline instead, while still using the cook-choice + remove
// sheets below.
export function AgendaSheets({ agenda, showMealSheet = true }: { agenda: AgendaState; showMealSheet?: boolean }) {
  const {
    addOpen, setAddOpen, isEditing, editBatchId,
    cookChoice, setCookChoice, confirmCook,
    removeTarget, setRemoveTarget, removeEvent,
  } = agenda;

  return (
    <>
      {showMealSheet && (
      <Sheet
        open={addOpen}
        title={isEditing ? (editBatchId != null ? "Edit batch" : "Edit meal") : "Add"}
        onClose={() => setAddOpen(false)}
      >
        <MealForm agenda={agenda} />
      </Sheet>
      )}

      <Sheet open={cookChoice !== null} title="Which did you have?" onClose={() => setCookChoice(null)}>
        <div className="sh-body stack-sm">
          {cookChoice?.choices.map((c) => {
            const sel = cookChoice.picked[c.ingredientId];
            const selProduct = c.products.find((p) => p.id === sel?.productId) ?? c.products[0];
            return (
              <div key={c.ingredientId} style={{ marginBottom: 12 }}>
                <p className="body" style={{ color: "var(--sage)" }}>{c.ingredientName}</p>
                {c.products.length > 1 && (
                  <div className="field">
                    <span className="field-label">Product</span>
                    <Dropdown
                      label="Product"
                      value={sel?.productId ?? null}
                      options={c.products.map((p) => ({ id: p.id, label: p.name }))}
                      onChange={(id) => {
                        const p = c.products.find((x) => x.id === Number(id))!;
                        setCookChoice((cc) =>
                          cc && { ...cc, picked: { ...cc.picked, [c.ingredientId]: { productId: p.id, variantId: p.variants[0]?.id ?? null } } },
                        );
                      }}
                    />
                  </div>
                )}
                {selProduct.variants.length > 0 && (
                  <div className="field">
                    <span className="field-label">Variant</span>
                    <Dropdown
                      label="Variant"
                      value={sel?.variantId ?? null}
                      options={selProduct.variants.map((v) => ({ id: v.id, label: v.name }))}
                      onChange={(id) =>
                        setCookChoice((cc) =>
                          cc && { ...cc, picked: { ...cc.picked, [c.ingredientId]: { productId: selProduct.id, variantId: Number(id) } } },
                        )
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" className="btn block" onClick={confirmCook}>Serve it</button>
        </div>
      </Sheet>

      <Sheet open={removeTarget !== null} title="Remove repeating meal" onClose={() => setRemoveTarget(null)}>
        <div className="sh-body">
          <p className="body" style={{ color: "var(--sage)" }}>
            “{removeTarget?.name}” repeats. What do you want to remove?
          </p>
          <button type="button" className="btn block" onClick={() => removeTarget && removeEvent(removeTarget.eventId, "one")}>
            This meal only
          </button>
          <button type="button" className="btn block" onClick={() => removeTarget && removeEvent(removeTarget.eventId, "following")}>
            This and all future meals
          </button>
          <button type="button" className="btn block" onClick={() => removeTarget && removeEvent(removeTarget.eventId, "all")}>
            All meals in the series
          </button>
        </div>
      </Sheet>
    </>
  );
}
