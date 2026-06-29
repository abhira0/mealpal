import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";

export const households = sqliteTable("households", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const ingredients = sqliteTable("ingredients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id),
  name: text("name").notNull(),
  // canonical stock unit: one of 'g' | 'ml' | 'oz' | 'count'
  canonicalUnit: text("canonical_unit").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const shops = sqliteTable("shops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id),
  name: text("name").notNull(),
  // e.g. "costco.com" or "https://costco.com" — used to derive the shop's logo
  website: text("website"),
  // explicit logo URL; overrides the website-derived favicon when set
  iconUrl: text("icon_url"),
  // uploaded logo bytes + mime; overrides iconUrl/website-derived favicon when set
  iconData: blob("icon_data", { mode: "buffer" }),
  iconMime: text("icon_mime"),
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id),
  ingredientId: integer("ingredient_id")
    .notNull()
    .references(() => ingredients.id),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id),
  name: text("name").notNull(),
  // how many of the ingredient's canonical units are in ONE unit of this product
  packSize: integer("pack_size").notNull(),
  // preference rank within the ingredient (lower = preferred). default 100.
  priority: integer("priority").notNull().default(100),
  // manual price override / seed in cents; null = derive from latest purchase
  priceCents: integer("price_cents"),
  available: integer("available", { mode: "boolean" }).notNull().default(true),
  url: text("url"),
  imageUrl: text("image_url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  name: text("name").notNull(),
  baseServings: integer("base_servings").notNull().default(1),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const recipeIngredients = sqliteTable("recipe_ingredients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredients.id),
  // amount in the ingredient's canonical unit, for baseServings
  amount: integer("amount").notNull(),
});

export const recipeSteps = sqliteTable("recipe_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  position: integer("position").notNull(),
  text: text("text").notNull(),
});

export const recipeMedia = sqliteTable("recipe_media", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  kind: text("kind").notNull(), // 'photo' | 'video' | 'youtube'
  url: text("url").notNull(),
});

export const mealSlots = sqliteTable("meal_slots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  name: text("name").notNull(),
  // "HH:MM" 24h. Slots auto-order by this; text sort matches chronological order.
  timeOfDay: text("time_of_day").notNull().default("12:00"),
});

export const mealEvents = sqliteTable("meal_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  // calendar date as YYYY-MM-DD text (date-only, no tz games)
  date: text("date").notNull(),
  slotId: integer("slot_id").notNull().references(() => mealSlots.id),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  servings: integer("servings").notNull().default(1),
  status: text("status").notNull().default("planned"), // 'planned' | 'cooked'
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const stockMovements = sqliteTable("stock_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredients.id),
  // signed canonical units: + purchase, - cooked, +/- manual
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(), // 'purchase' | 'cooked' | 'manual'
  mealEventId: integer("meal_event_id").references(() => mealEvents.id),
  purchaseId: integer("purchase_id"),
  at: integer("at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull().default(1),
  // null = bought but not yet priced (fill in later via the bill screen)
  cents: integer("cents"),
  // date-only YYYY-MM-DD; null = no expiry tracked
  expiresAt: text("expires_at"),
  purchasedAt: integer("purchased_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
