"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, X } from "lucide-react";
import { Sheet } from "@/components/Sheet";
import { Stepper } from "@/components/Stepper";
import { Dropdown } from "@/components/Dropdown";

type Ingredient = { id: number; name: string; canonicalUnit: string };
type DraftIngredient = { ingredientId: number | null; amount: string };
type DraftStep = { id: string; text: string; start: string; end: string };
type Media = { kind: string; url: string };

// Full recipe shape when editing; undefined when creating.
export type EditableRecipe = {
  id: number;
  name: string;
  baseServings: number;
  notes: string | null;
  totalMinutes?: number | null;
  ingredients: { ingredientId: number; amount: number }[];
  steps: { position: number; text: string; startSeconds?: number | null; endSeconds?: number | null }[];
  media?: Media[];
};

type Tab = "details" | "ingredients" | "steps";

let stepUid = 0;
const newStep = (text = "", start = "", end = ""): DraftStep => ({ id: `s${stepUid++}`, text, start, end });

/** "1:05" or "65" -> 65 seconds; blank/invalid -> null. */
function parseClip(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const [m, sec] = t.split(":");
    const total = Number(m) * 60 + Number(sec);
    return Number.isFinite(total) ? total : null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 65 -> "1:05"; null -> "". */
function fmtClip(n: number | null | undefined): string {
  if (n == null) return "";
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}

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
  const [tab, setTab] = useState<Tab>("details");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [name, setName] = useState("");
  const [baseServings, setBaseServings] = useState(2);
  const [totalMinutes, setTotalMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftIngredient[]>([{ ingredientId: null, amount: "" }]);
  const [steps, setSteps] = useState<DraftStep[]>([newStep()]);
  // The recipe photo (data URL or existing url); null = none.
  const [photo, setPhoto] = useState<string | null>(null);
  // Non-photo media (video/youtube) preserved across edits.
  const [otherMedia, setOtherMedia] = useState<Media[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    setTab("details");
    if (recipe) {
      setName(recipe.name);
      setBaseServings(recipe.baseServings || 1);
      setTotalMinutes(recipe.totalMinutes ? String(recipe.totalMinutes) : "");
      setNotes(recipe.notes ?? "");
      setLines(
        recipe.ingredients.length
          ? recipe.ingredients.map((i) => ({ ingredientId: i.ingredientId, amount: String(i.amount) }))
          : [{ ingredientId: null, amount: "" }],
      );
      setSteps(
        recipe.steps.length
          ? recipe.steps.map((s) => newStep(s.text, fmtClip(s.startSeconds), fmtClip(s.endSeconds)))
          : [newStep()],
      );
      const media = recipe.media ?? [];
      setPhoto(media.find((m) => m.kind === "photo")?.url ?? null);
      setOtherMedia(media.filter((m) => m.kind !== "photo"));
    } else {
      setName("");
      setBaseServings(2);
      setTotalMinutes("");
      setNotes("");
      setLines([{ ingredientId: null, amount: "" }]);
      setSteps([newStep()]);
      setPhoto(null);
      setOtherMedia([]);
    }
  }, [open, recipe]);

  const ingredientOptions = ingredients.map((i) => ({ id: i.id, label: i.name }));
  const hasVideo = otherMedia.some((m) => m.kind === "youtube" || m.kind === "video");

  function updateLine(idx: number, patch: Partial<DraftIngredient>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function insertStep(at: number) {
    setSteps((prev) => [...prev.slice(0, at), newStep(), ...prev.slice(at)]);
  }
  function updateStep(id: string, patch: Partial<DraftStep>) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeStep(id: string) {
    setSteps((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  }
  function onStepDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function submit() {
    if (!name.trim()) {
      setTab("details");
      setError("Please give the recipe a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      baseServings,
      totalMinutes: Number(totalMinutes) || null,
      notes: notes.trim() || null,
      ingredients: lines
        .filter((l) => l.ingredientId != null && l.amount.trim() !== "")
        .map((l) => ({ ingredientId: l.ingredientId as number, amount: Number(l.amount) || 0 })),
      steps: steps
        .filter((s) => s.text.trim() !== "")
        .map((s) => ({ text: s.text.trim(), startSeconds: parseClip(s.start), endSeconds: parseClip(s.end) })),
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
        <div className="tabs" role="tablist" style={{ marginBottom: 4 }}>
          <button type="button" aria-pressed={tab === "details"} onClick={() => setTab("details")}>Details</button>
          <button type="button" aria-pressed={tab === "ingredients"} onClick={() => setTab("ingredients")}>Ingredients</button>
          <button type="button" aria-pressed={tab === "steps"} onClick={() => setTab("steps")}>Steps</button>
        </div>

        {tab === "details" && (
          <>
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

            <label className="field">
              <span className="field-label">Total time (min)</span>
              <input
                type="text"
                inputMode="numeric"
                className="input mono"
                value={totalMinutes}
                onChange={(e) => setTotalMinutes(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Optional, e.g. 15"
              />
            </label>

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
          </>
        )}

        {tab === "ingredients" && (
          <div className="field">
            <span className="field-label">Ingredients</span>
            <div className="stack-sm">
              {lines.map((line, idx) => {
                const unit = ingredients.find((i) => i.id === line.ingredientId)?.canonicalUnit;
                return (
                  <div key={idx} className="ing-edit">
                    <div className="ing-edit-sel">
                      <Dropdown
                        value={line.ingredientId}
                        options={ingredientOptions}
                        placeholder={ingredients.length === 0 ? "No ingredients yet" : "Choose…"}
                        onChange={(id) => updateLine(idx, { ingredientId: Number(id) })}
                      />
                    </div>
                    <div className="ing-edit-qty">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="input mono"
                        value={line.amount}
                        onChange={(e) => updateLine(idx, { amount: e.target.value })}
                        placeholder="Amount"
                        aria-label="Amount"
                      />
                      {unit ? <span className="ing-edit-unit mono">{unit}</span> : null}
                    </div>
                    <button
                      type="button"
                      className="icon-x"
                      aria-label="Remove ingredient"
                      onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))}
                    >
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="trigger add"
                onClick={() => setLines((prev) => [...prev, { ingredientId: null, amount: "" }])}
              >
                + Add ingredient
              </button>
            </div>
          </div>
        )}

        {tab === "steps" && (
          <div className="field">
            <span className="field-label">Steps</span>
            {hasVideo ? (
              <span className="body" style={{ color: "var(--sage)", marginBottom: 6, display: "block" }}>
                Add a clip (start–end, e.g. 1:05) to play that moment in cook mode. Drag the handle to reorder.
              </span>
            ) : (
              <span className="body" style={{ color: "var(--sage)", marginBottom: 6, display: "block" }}>
                Drag the handle to reorder. Use + to insert a step.
              </span>
            )}
            <div className="stack-sm">
              <InsertLine onClick={() => insertStep(0)} />
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onStepDragEnd}>
                <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  {steps.map((step, idx) => (
                    <div key={step.id} className="stack-sm" style={{ gap: 0 }}>
                      <SortableStep
                        step={step}
                        index={idx}
                        hasVideo={hasVideo}
                        canRemove={steps.length > 1}
                        onChange={(patch) => updateStep(step.id, patch)}
                        onRemove={() => removeStep(step.id)}
                      />
                      <InsertLine onClick={() => insertStep(idx + 1)} />
                    </div>
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </div>
        )}

        {error ? <p className="notice">{error}</p> : null}

        <button type="button" className="btn block" disabled={saving} onClick={submit}>
          {saving ? "Saving…" : editing ? "Save changes" : "Save recipe"}
        </button>
      </div>
    </Sheet>
  );
}

function InsertLine({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="step-insert" aria-label="Insert step here" onClick={onClick}>
      <Plus size={14} />
    </button>
  );
}

function SortableStep({
  step,
  index,
  hasVideo,
  canRemove,
  onChange,
  onRemove,
}: {
  step: DraftStep;
  index: number;
  hasVideo: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<DraftStep>) => void;
  onRemove: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="step-edit">
      <button
        type="button"
        className="step-grip"
        aria-label={`Reorder step ${index + 1}`}
        style={{ touchAction: "none" }}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>
      <span className="step-edit-num mono">{index + 1}</span>
      <div className="step-edit-body">
        <input
          type="text"
          className="input"
          value={step.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder={`Step ${index + 1}`}
          aria-label={`Step ${index + 1}`}
        />
        {hasVideo ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              inputMode="numeric"
              className="input mono"
              value={step.start}
              onChange={(e) => onChange({ start: e.target.value })}
              placeholder="Clip start (0:30)"
              aria-label={`Step ${index + 1} clip start`}
            />
            <input
              type="text"
              inputMode="numeric"
              className="input mono"
              value={step.end}
              onChange={(e) => onChange({ end: e.target.value })}
              placeholder="Clip end (0:48)"
              aria-label={`Step ${index + 1} clip end`}
            />
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="icon-x"
        aria-label={`Remove step ${index + 1}`}
        disabled={!canRemove}
        onClick={onRemove}
      >
        <X size={16} />
      </button>
    </div>
  );
}
