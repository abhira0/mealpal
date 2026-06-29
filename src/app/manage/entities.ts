// Config-driven Manage section. One entry per entity, keyed by URL slug.
// EntityList + EntityForm read from this so we don't hand-write 15 pages.

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "file" | "time";
  // For type:"select" — pull options from another entity's list endpoint,
  // using `optionLabel` for the visible text and `id` for the value.
  optionsFrom?: EntitySlug;
  optionLabel?: string;
  // Static options (e.g. canonicalUnit). Used when optionsFrom is absent.
  options?: string[];
  required?: boolean;
  optional?: boolean; // shown in label as "(optional)"
  // Show a unit beside this field, read off the row selected in another field
  // (e.g. pack size's unit = the chosen ingredient's canonicalUnit).
  unitFrom?: { field: string; attr: string };
  // Derive the edit-form initial value from the row when the field name doesn't
  // match a row key (e.g. dollars input ← priceCents). Default: String(row[name]).
  prefill?: (row: Record<string, unknown>) => string;
};

export type ColumnDef = {
  // Key on the row object. For FK columns, set `refFrom` to resolve id→name.
  key: string;
  label: string;
  // Resolve this column's value (an id) to a name from another entity's list.
  refFrom?: EntitySlug;
  refLabel?: string;
  // Custom formatter (e.g. cents → dollars). Receives the raw row.
  format?: (row: Record<string, unknown>) => string;
};

export type EntityConfig = {
  label: string;
  singular: string;
  listPath: string; // GET (list) + POST (create)
  itemPath: (id: string | number) => string; // PATCH + DELETE
  columns: ColumnDef[];
  fields: FieldDef[];
  // If set, the list shows a brand favicon for each row.
  icon?: (row: Record<string, unknown>) => {
    name: string;
    website?: string | null;
    iconUrl?: string | null;
  };
  // If set, the row stacks (name on top) with a large image column beside details.
  bigImage?: boolean;
  canEdit: boolean;
  canDelete: boolean;
  // If set, the New form shows an "Import from site" button that POSTs here
  // and prefills any returned key matching a field name.
  importPath?: string;
  toCreatePayload: (values: Record<string, string>) => Record<string, unknown>;
  toUpdatePayload: (values: Record<string, string>) => Record<string, unknown>;
};

export type EntitySlug = "shops" | "ingredients" | "products" | "slots";

function num(v: string | undefined): number {
  return Number(v);
}
function optNum(v: string | undefined): number | undefined {
  return v ? Number(v) : undefined;
}
function optStr(v: string | undefined): string | undefined {
  return v ? v : undefined;
}

function dollars(cents: unknown): string {
  return cents == null ? "—" : `$${(Number(cents) / 100).toFixed(2)}`;
}

// Effective price = manual override ?? latest purchase (computed server-side).
function formatPrice(row: Record<string, unknown>): string {
  return dollars(row.effectiveCents);
}

// Compact purchase history, newest first: "$13.49 · $12.99 · $11.99".
function formatHistory(row: Record<string, unknown>): string {
  const history = (row.history as { cents: number }[] | undefined) ?? [];
  if (history.length === 0) return "—";
  return history.slice(0, 5).map((h) => dollars(h.cents)).join(" · ");
}

export const ENTITIES: Record<EntitySlug, EntityConfig> = {
  shops: {
    label: "Shops",
    singular: "Shop",
    listPath: "/api/shops",
    itemPath: (id) => `/api/shops/${id}`,
    columns: [
      { key: "name", label: "Name" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "website", label: "Website", type: "text", optional: true },
      { name: "iconUrl", label: "Icon", type: "file", optional: true },
    ],
    icon: (row) => ({
      name: String(row.name ?? ""),
      website: row.website as string | null,
      iconUrl: row.iconUrl as string | null,
    }),
    canEdit: true,
    canDelete: true,
    toCreatePayload: (v) => ({
      name: v.name,
      website: optStr(v.website) ?? null,
      iconUrl: optStr(v.iconUrl) ?? null,
    }),
    toUpdatePayload: (v) => ({
      name: v.name,
      website: optStr(v.website) ?? null,
      iconUrl: optStr(v.iconUrl) ?? null,
    }),
  },

  ingredients: {
    label: "Ingredients",
    singular: "Ingredient",
    listPath: "/api/ingredients",
    itemPath: (id) => `/api/ingredients/${id}`,
    columns: [
      { key: "name", label: "Name" },
      { key: "stock", label: "In stock", format: (row) => `${row.stock ?? 0}${row.canonicalUnit ?? ""}` },
    ],
    icon: (row) => ({
      name: String(row.name ?? ""),
      iconUrl: row.imageUrl as string | null,
    }),
    bigImage: true,
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "canonicalUnit", label: "Unit", type: "select", options: ["g", "ml", "oz", "count"], required: true },
    ],
    canEdit: true,
    canDelete: true,
    toCreatePayload: (v) => ({
      name: v.name,
      canonicalUnit: v.canonicalUnit,
    }),
    toUpdatePayload: (v) => ({
      name: v.name,
      canonicalUnit: v.canonicalUnit,
    }),
  },

  products: {
    label: "Products",
    singular: "Product",
    listPath: "/api/products",
    itemPath: (id) => `/api/products/${id}`,
    columns: [
      { key: "name", label: "Name" },
      { key: "ingredientId", label: "Ingredient", refFrom: "ingredients", refLabel: "name" },
      { key: "shopId", label: "Shop", refFrom: "shops", refLabel: "name" },
      { key: "packSize", label: "Pack size" },
      { key: "effectiveCents", label: "Price", format: formatPrice },
      { key: "history", label: "Purchase history", format: formatHistory },
    ],
    icon: (row) => ({
      name: String(row.name ?? ""),
      iconUrl: row.imageUrl as string | null,
    }),
    bigImage: true,
    fields: [
      { name: "ingredientId", label: "Ingredient", type: "select", optionsFrom: "ingredients", optionLabel: "name", required: true },
      { name: "shopId", label: "Shop", type: "select", optionsFrom: "shops", optionLabel: "name", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "packSize", label: "Pack size", type: "number", required: true, unitFrom: { field: "ingredientId", attr: "canonicalUnit" } },
      { name: "dollars", label: "Price ($) — manual override; blank = use latest purchase", type: "number", optional: true, prefill: (r) => (r.priceCents != null ? String(Number(r.priceCents) / 100) : "") },
      // priority is set by drag-reorder on the ingredient detail page, not here
      { name: "url", label: "URL", type: "text", optional: true },
      { name: "imageUrl", label: "Image URL", type: "text", optional: true },
    ],
    canEdit: true,
    canDelete: true,
    importPath: "/api/import/instacart",
    toCreatePayload: (v) => ({
      ingredientId: num(v.ingredientId),
      shopId: num(v.shopId),
      name: v.name,
      packSize: num(v.packSize) || 1,
      dollars: optNum(v.dollars),
      url: optStr(v.url),
      imageUrl: optStr(v.imageUrl),
    }),
    toUpdatePayload: (v) => ({
      ingredientId: num(v.ingredientId),
      shopId: num(v.shopId),
      name: v.name,
      packSize: num(v.packSize) || 1,
      // "" → null clears the override; absent stays absent (PATCH ignores undefined)
      dollars: v.dollars ?? undefined,
      url: optStr(v.url),
      imageUrl: optStr(v.imageUrl),
    }),
  },

  slots: {
    label: "Meal slots",
    singular: "Slot",
    listPath: "/api/slots",
    itemPath: (id) => `/api/slots/${id}`,
    columns: [
      { key: "name", label: "Name" },
      { key: "timeOfDay", label: "Time" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "timeOfDay", label: "Time of day", type: "time", required: true },
    ],
    canEdit: true,
    canDelete: true,
    toCreatePayload: (v) => ({ name: v.name, timeOfDay: v.timeOfDay || "12:00" }),
    toUpdatePayload: (v) => ({ name: v.name, timeOfDay: v.timeOfDay || "12:00" }),
  },
};

export const ENTITY_SLUGS = Object.keys(ENTITIES) as EntitySlug[];

export function isEntitySlug(slug: string): slug is EntitySlug {
  return slug in ENTITIES;
}
