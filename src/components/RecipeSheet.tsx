"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Stepper } from "@/components/Stepper";
import { Dropdown } from "@/components/Dropdown";

type Ingredient = { id: number; name: string; canonicalUnit: string };
type DraftIngredient = { ingredientId: number | null; amount: string };
type Media = { kind: string; url: string };

// Full recipe shape when editing; undefined when creating.
export type EditableRecipe = {
  id: number;
  name: string;
  baseServings: number;
  notes: string | null;
  ingredients: { ingredientId: number; amount: number }[];
  steps: { position: number; text: string }[];
  media?: Media[];
};

/** Downscale an image file to a JPEG data URL (longest side <= max px). */
async function fileToPhotoDataUrl(file: File, max = 1024): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("bad image"));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function RecipeSheet({
  open,
  onClose,
  onSaved,
  recipe,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  recipe?: EditableRecipe;
}) {
  const editing = recipe != null;
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [name, setName] = useState("");
  const [baseServings, setBaseServings] = useState(2);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftIngredient[]>([{ ingredientId: null, amount: "" }]);
  const [steps, setSteps] = useState<string[]>([""]);
  // The recipe photo (data URL or existing url); null = none.
  const [photo, setPhoto] = useState<string | null>(null);
  // Non-photo media (video/youtube) preserved across edits.
  const [otherMedia, setOtherMedia] = useState<Media[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/ingredients")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Ingredient[]) => setIngredients(data))
      .catch(() => setIngredients([]));
  }, [open]);

  // Prefill (edit) or reset (create) whenever the sheet opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (recipe) {
      setName(recipe.name);
      setBaseServings(recipe.baseServings || 1);
      setNotes(recipe.notes ?? "");
      setLines(
        recipe.ingredients.length
          ? recipe.ingredients.map((i) => ({ ingredientId: i.ingredientId, amount: String(i.amount) }))
          : [{ ingredientId: null, amount: "" }],
      );
      setSteps(recipe.steps.length ? recipe.steps.map((s) => s.text) : [""]);
      const media = recipe.media ?? [];
      setPhoto(media.find((m) => m.kind === "photo")?.url ?? null);
      setOtherMedia(media.filter((m) => m.kind !== "photo"));
    } else {
      setName("");
      setBaseServings(2);
      setNotes("");
      setLines([{ ingredientId: null, amount: "" }]);
      setSteps([""]);
      setPhoto(null);
      setOtherMedia([]);
    }
  }, [open, recipe]);

  const ingredientOptions = ingredients.map((i) => ({ id: i.id, label: i.name }));

  function updateLine(idx: number, patch: Partial<DraftIngredient>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function submit() {
    if (!name.trim()) {
      setError("Please give the recipe a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      baseServings,
      notes: notes.trim() || null,
      ingredients: lines
        .filter((l) => l.ingredientId != null && l.amount.trim() !== "")
        .map((l) => ({ ingredientId: l.ingredientId as number, amount: Number(l.amount) || 0 })),
      steps: steps.map((s) => s.trim()).filter(Boolean),
      media: [...otherMedia, ...(photo ? [{ kind: "photo", url: photo }] : [])],
    };
    const res = await fetch(editing ? `/api/recipes/${recipe.id}` : "/api/recipes", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't save the recipe. Please try again.");
      return;
    }
    onSaved();
  }

  return (
    <Sheet open={open} title={editing ? "Edit recipe" : "New recipe"} onClose={onClose}>
      <div className="sh-body">
        <label className="field">
          <span className="field-label">Name</span>
          <input
            type="text"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sunday Pancakes"
          />
        </label>

        <div className="servings-row">
          <span className="field-label" style={{ marginBottom: 0 }}>Base servings</span>
          <Stepper value={baseServings} min={1} onChange={setBaseServings} />
        </div>

        <div className="field">
          <span className="field-label">Ingredients</span>
          <div className="stack-sm">
            {lines.map((line, idx) => (
              <div key={idx} className="stack-sm" style={{ gap: 6 }}>
                <Dropdown
                  value={line.ingredientId}
                  options={ingredientOptions}
                  placeholder={
                    ingredients.length === 0 ? "No ingredients yet" : "Choose ingredient…"
                  }
                  onChange={(id) => updateLine(idx, { ingredientId: Number(id) })}
                />
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input mono"
                    value={line.amount}
                    onChange={(e) => updateLine(idx, { amount: e.target.value })}
                    placeholder="Amount (e.g. 300)"
                    aria-label="Amount"
                  />
                  {(() => {
                    const unit = ingredients.find((i) => i.id === line.ingredientId)?.canonicalUnit;
                    return unit ? (
                      <span
                        className="mono"
                        style={{
                          position: "absolute",
                          right: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          opacity: 0.5,
                          pointerEvents: "none",
                        }}
                      >
                        {unit}
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="trigger add"
              onClick={() => setLines((prev) => [...prev, { ingredientId: null, amount: "" }])}
            >
              + Add ingredient
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field-label">Steps</span>
          <div className="stack-sm">
            {steps.map((step, idx) => (
              <input
                key={idx}
                type="text"
                className="input"
                value={step}
                onChange={(e) =>
                  setSteps((prev) => prev.map((s, i) => (i === idx ? e.target.value : s)))
                }
                placeholder={`Step ${idx + 1}`}
                aria-label={`Step ${idx + 1}`}
              />
            ))}
            <button
              type="button"
              className="trigger add"
              onClick={() => setSteps((prev) => [...prev, ""])}
            >
              + Add step
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field-label">Photo</span>
          {photo ? (
            <div className="media" style={{ marginBottom: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Recipe" />
            </div>
          ) : null}
          <div className="stack-sm" style={{ flexDirection: "row", gap: 8 }}>
            <label className="trigger add" style={{ cursor: "pointer" }}>
              {photo ? "Replace photo" : "Add photo"}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    setPhoto(await fileToPhotoDataUrl(file));
                  } catch {
                    setError("Couldn't read that image.");
                  }
                }}
              />
            </label>
            {photo ? (
              <button type="button" className="trigger add" onClick={() => setPhoto(null)}>
                Remove
              </button>
            ) : null}
          </div>
        </div>

        <label className="field">
          <span className="field-label">Notes</span>
          <textarea
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            rows={2}
            style={{ resize: "vertical" }}
          />
        </label>

        {error ? <p className="notice">{error}</p> : null}

        <button type="button" className="btn block" disabled={saving} onClick={submit}>
          {saving ? "Saving…" : editing ? "Save changes" : "Save recipe"}
        </button>
      </div>
    </Sheet>
  );
}
