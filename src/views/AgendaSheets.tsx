"use client";

import { Dropdown } from "@/components/Dropdown";
import { Stepper } from "@/components/Stepper";
import { Sheet } from "@/components/Sheet";
import { DOW } from "@/views/agenda-parts";
import type { AgendaState } from "@/views/agenda-data";

/**
 * The three <Sheet>s that back the Today experience — the Add/Edit meal
 * wizard, the "Which did you have?" cook-choice picker, and the "Remove
 * repeating meal" scope chooser. Rendered identically by both layouts.
 */
export function AgendaSheets({ agenda }: { agenda: AgendaState }) {
  const {
    slots, recipes, products, ingredients,
    addOpen, setAddOpen, isEditing, editBatchId,
    addDate, setAddDate, addSlotId, setAddSlotId, addKind, setAddKind,
    addRecipeId, setAddRecipeId, addServings, setAddServings,
    addProductId, selectAddProduct, addVariantId, setAddVariantId, addVariants,
    addProductAmount, setAddProductAmount,
    addIngredientId, setAddIngredientId, addAmount, setAddAmount,
    addLabel, setAddLabel, addMeals, setAddMeals,
    addItems, addBatchItem, updateBatchItem, removeBatchItem,
    addRepeat, setAddRepeat, addRepeatDays, setAddRepeatDays,
    addIntervalN, setAddIntervalN, addUnit, setAddUnit, addUntil, setAddUntil,
    addValid, addSaving, submitAdd,
    cookChoice, setCookChoice, confirmCook,
    removeTarget, setRemoveTarget, removeEvent,
  } = agenda;

  return (
    <>
      <Sheet
        open={addOpen}
        title={isEditing ? (editBatchId != null ? "Edit batch" : "Edit meal") : "Add"}
        onClose={() => setAddOpen(false)}
      >
        <div className="sh-body stack-sm">
          <div className="field">
            <span className="field-label">Day</span>
            <input
              type="date"
              className="input"
              value={addDate}
              onChange={(e) => e.target.value && setAddDate(e.target.value)}
            />
          </div>
          <div className="field">
            <span className="field-label">Slot</span>
            <Dropdown
              label="Slot"
              value={addSlotId}
              options={slots.map((s) => ({ id: s.id, label: s.name }))}
              onChange={(id) => setAddSlotId(Number(id))}
            />
          </div>

          <div className="filter">
            <button type="button" aria-pressed={addKind === "recipe"} onClick={() => setAddKind("recipe")}>
              Recipe
            </button>
            <button type="button" aria-pressed={addKind === "product"} onClick={() => setAddKind("product")}>
              Product
            </button>
            <button type="button" aria-pressed={addKind === "ingredient"} onClick={() => setAddKind("ingredient")}>
              Ingredient
            </button>
            <button type="button" aria-pressed={addKind === "batch"} onClick={() => setAddKind("batch")}>
              Batch
            </button>
          </div>

          {addKind === "recipe" && (
            <>
              <div className="field">
                <span className="field-label">Recipe</span>
                <Dropdown
                  label="Recipe"
                  value={addRecipeId}
                  options={recipes.map((r) => ({ id: r.id, label: r.name }))}
                  onChange={(id) => setAddRecipeId(Number(id))}
                />
              </div>
              <div className="servings-row">
                <span className="field-label" style={{ marginBottom: 0 }}>Servings</span>
                <Stepper value={addServings} min={1} onChange={setAddServings} />
              </div>
            </>
          )}

          {addKind === "product" && (
            <>
              <div className="field">
                <span className="field-label">Product</span>
                <Dropdown
                  label="Product"
                  value={addProductId}
                  options={products.map((p) => ({ id: p.id, label: p.name }))}
                  onChange={(id) => selectAddProduct(Number(id))}
                />
              </div>
              {addVariants.length > 0 && (
                <div className="field">
                  <span className="field-label">Variant (optional)</span>
                  <Dropdown
                    label="Variant"
                    value={addVariantId}
                    options={addVariants.map((v) => ({ id: v.id, label: v.name }))}
                    onChange={(id) => setAddVariantId(Number(id))}
                  />
                </div>
              )}
              <div className="servings-row">
                <span className="field-label" style={{ marginBottom: 0 }}>Servings</span>
                <Stepper value={addServings} min={1} onChange={setAddServings} />
              </div>
              <div className="field">
                <span className="field-label">Amount (optional)</span>
                <input
                  className="input mono"
                  inputMode="decimal"
                  value={addProductAmount}
                  onChange={(e) => setAddProductAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g. 150"
                />
              </div>
            </>
          )}

          {addKind === "ingredient" && (
            <>
              <div className="field">
                <span className="field-label">Ingredient</span>
                <Dropdown
                  label="Ingredient"
                  value={addIngredientId}
                  options={ingredients.map((i) => ({ id: i.id, label: i.name }))}
                  onChange={(id) => setAddIngredientId(Number(id))}
                />
              </div>
              <div className="field">
                <span className="field-label">
                  Amount{addIngredientId != null ? ` (${ingredients.find((i) => i.id === addIngredientId)?.canonicalUnit ?? ""})` : ""}
                </span>
                <input
                  className="input mono"
                  inputMode="decimal"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="e.g. 43"
                />
              </div>
            </>
          )}

          {addKind === "batch" && (
            <>
              <div className="field">
                <span className="field-label">Label</span>
                <input
                  className="input"
                  value={addLabel}
                  onChange={(e) => setAddLabel(e.target.value)}
                  placeholder="e.g. Chicken & rice"
                />
              </div>
              <div className="servings-row">
                <span className="field-label" style={{ marginBottom: 0 }}>Meals</span>
                <Stepper value={addMeals} min={1} onChange={setAddMeals} />
              </div>

              <p className="section-label">Contents</p>
              {addItems.map((it, i) => (
                <div key={i} className="stack-sm" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10 }}>
                  <div className="filter">
                    <button
                      type="button"
                      aria-pressed={it.kind === "recipe"}
                      onClick={() => updateBatchItem(i, { kind: "recipe", refId: recipes[0]?.id ?? null })}
                    >
                      Recipe
                    </button>
                    <button
                      type="button"
                      aria-pressed={it.kind === "product"}
                      // ponytail: no variant picker for direct-product batch items — base product only
                      onClick={() => updateBatchItem(i, { kind: "product", refId: products[0]?.id ?? null })}
                    >
                      Product
                    </button>
                  </div>
                  <div className="field">
                    <span className="field-label">{it.kind === "recipe" ? "Recipe" : "Product"}</span>
                    <Dropdown
                      label={it.kind === "recipe" ? "Recipe" : "Product"}
                      value={it.refId}
                      options={
                        it.kind === "recipe"
                          ? recipes.map((r) => ({ id: r.id, label: r.name }))
                          : products.map((p) => ({ id: p.id, label: p.name }))
                      }
                      onChange={(id) => updateBatchItem(i, { refId: Number(id) })}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">Amount (optional)</span>
                    <input
                      className="input mono"
                      inputMode="decimal"
                      value={it.amount}
                      onChange={(e) => updateBatchItem(i, { amount: e.target.value.replace(/[^0-9.]/g, "") })}
                      placeholder="e.g. 4"
                    />
                  </div>
                  {addItems.length > 1 && (
                    <button type="button" className="btn-add" onClick={() => removeBatchItem(i)}>
                      Remove item
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn-add" onClick={addBatchItem}>
                + Add item
              </button>
            </>
          )}

          {addKind !== "batch" && !isEditing && (
            <>
              <div className="servings-row">
                <span className="field-label" style={{ marginBottom: 0 }}>Repeat</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={addRepeat}
                  className={addRepeat ? "btn" : "btn-add"}
                  onClick={() => setAddRepeat((v) => !v)}
                >
                  {addRepeat ? "On" : "Off"}
                </button>
              </div>
              {addRepeat && (
                <>
                  {addUnit === "week" && (
                    <div className="week week--repeat" role="group" aria-label="Repeat on">
                      {DOW.map((label, i) => (
                        <button
                          key={i}
                          type="button"
                          aria-pressed={addRepeatDays[i]}
                          className={addRepeatDays[i] ? "day on" : "day"}
                          onClick={() => setAddRepeatDays((ds) => ds.map((d, j) => (j === i ? !d : d)))}
                        >
                          <span className="dow">{label[0]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="servings-row">
                    <span className="field-label" style={{ marginBottom: 0 }}>Every</span>
                    <Stepper value={addIntervalN} min={1} onChange={setAddIntervalN} />
                    <Dropdown
                      label="Unit"
                      value={addUnit}
                      options={[
                        { id: "week", label: addIntervalN > 1 ? "weeks" : "week" },
                        { id: "day", label: addIntervalN > 1 ? "days" : "day" },
                      ]}
                      onChange={(id) => setAddUnit(id === "day" ? "day" : "week")}
                    />
                  </div>
                  <div className="field">
                    <span className="field-label">Until (optional)</span>
                    <input
                      type="date"
                      className="input"
                      data-empty={addUntil ? undefined : ""}
                      value={addUntil}
                      min={addDate}
                      onChange={(e) => setAddUntil(e.target.value)}
                    />
                  </div>
                </>
              )}
            </>
          )}

          <button type="button" className="btn block" disabled={!addValid || addSaving} onClick={submitAdd}>
            {addSaving ? "Saving…" : isEditing ? "Save" : "Add"}
          </button>
        </div>
      </Sheet>

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
