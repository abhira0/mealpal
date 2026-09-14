"use client";

import { Dropdown } from "@/components/Dropdown";
import { Stepper } from "@/components/Stepper";
import { DOW } from "@/views/agenda-parts";
import { defaultMealItem } from "@/views/agenda-data";
import type { AgendaState, MealItem, Recipe, Product, Ingredient } from "@/views/agenda-data";

/** One line of the meal builder: a kind toggle, its picker, and a quantity. */
function MealItemRow({
  item, recipes, products, ingredients, onChange, onRemove,
}: {
  item: MealItem;
  recipes: Recipe[];
  products: Product[];
  ingredients: Ingredient[];
  onChange: (patch: Partial<MealItem>) => void;
  onRemove?: () => void;
}) {
  const refs = { recipes, products, ingredients };
  const unit = item.kind === "ingredient"
    ? ingredients.find((i) => i.id === item.refId)?.canonicalUnit ?? ""
    : "";
  return (
    <div className="stack-sm" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10 }}>
      <div className="filter">
        <button type="button" aria-pressed={item.kind === "recipe"} onClick={() => onChange(defaultMealItem("recipe", refs))}>Recipe</button>
        <button type="button" aria-pressed={item.kind === "product"} onClick={() => onChange(defaultMealItem("product", refs))}>Product</button>
        <button type="button" aria-pressed={item.kind === "ingredient"} onClick={() => onChange(defaultMealItem("ingredient", refs))}>Ingredient</button>
      </div>
      <div className="field">
        <span className="field-label">{item.kind === "recipe" ? "Recipe" : item.kind === "product" ? "Product" : "Ingredient"}</span>
        <Dropdown
          label={item.kind}
          value={item.refId}
          options={(item.kind === "recipe" ? recipes : item.kind === "product" ? products : ingredients).map((r) => ({ id: r.id, label: r.name }))}
          onChange={(id) => onChange({ refId: Number(id) })}
        />
      </div>
      {item.kind !== "ingredient" ? (
        <div className="servings-row">
          <span className="field-label" style={{ marginBottom: 0 }}>Servings</span>
          <Stepper value={item.servings} min={1} onChange={(v) => onChange({ servings: v })} />
        </div>
      ) : null}
      {item.kind === "ingredient" ? (
        <div className="field">
          <span className="field-label">Amount{unit ? ` (${unit})` : ""}</span>
          <input className="input mono" inputMode="decimal" value={item.amount}
            onChange={(e) => onChange({ amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="e.g. 43" />
        </div>
      ) : item.kind === "product" ? (
        <div className="field">
          <span className="field-label">Amount (optional)</span>
          <input className="input mono" inputMode="decimal" value={item.amount}
            onChange={(e) => onChange({ amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="e.g. 150" />
        </div>
      ) : null}
      {onRemove ? (
        <button type="button" className="btn-add" onClick={onRemove}>Remove item</button>
      ) : null}
    </div>
  );
}

/**
 * The unified create/edit schedule form — the single "model" for a meal. Driven
 * entirely by the agenda hook's add/edit state, so it behaves identically whether
 * it's hosted in a bottom Sheet (mobile) or inline in the desktop Plan inspector.
 * Editing (`isEditing`) shows the type toggle + scope; creating shows the
 * multi-item builder + repeat options.
 */
export function MealForm({ agenda }: { agenda: AgendaState }) {
  const {
    slots, recipes, products, ingredients,
    isEditing, editRuleId, editScope, setEditScope,
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
  } = agenda;

  const repeatControls = (
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
  );

  return (
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

      {isEditing && (<>
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
              <span className="field-label">Variant (for planning · asked again when served)</span>
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
      </>)}

      {!isEditing && (
        <>
          <p className="section-label">Items</p>
          {addItems.map((it, i) => (
            <MealItemRow
              key={i}
              item={it}
              recipes={recipes}
              products={products}
              ingredients={ingredients}
              onChange={(patch) => updateBatchItem(i, patch)}
              onRemove={addItems.length > 1 ? () => removeBatchItem(i) : undefined}
            />
          ))}
          <button type="button" className="btn-add" onClick={addBatchItem}>+ Add item</button>

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
          {addRepeat && <>{repeatControls}</>}
        </>
      )}

      {isEditing && editRuleId != null && (
        <>
          <p className="section-label">Repeats</p>
          {repeatControls}
          <div className="field">
            <span className="field-label">Applies to</span>
          <div className="filter">
            <button type="button" aria-pressed={editScope === "one"} onClick={() => setEditScope("one")}>
              This meal
            </button>
            <button type="button" aria-pressed={editScope === "following"} onClick={() => setEditScope("following")}>
              This + future
            </button>
            <button type="button" aria-pressed={editScope === "all"} onClick={() => setEditScope("all")}>
              All
            </button>
            </div>
          </div>
        </>
      )}

      <button type="button" className="btn block" disabled={!addValid || addSaving} onClick={submitAdd}>
        {addSaving ? "Saving…" : isEditing ? "Save" : "Add"}
      </button>
    </div>
  );
}
