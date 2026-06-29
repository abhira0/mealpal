import { sqliteTable, text, integer, real, blob } from "drizzle-orm/sqlite-core";

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
  // public-folder path to the uploaded nutrition-facts label photo, e.g. "/nutrition/3.jpg"
  nutritionPhoto: text("nutrition_photo"),
  // one serving, in the ingredient's canonical unit (e.g. 30 g). null = unknown.
  servingSize: real("serving_size"),
  // nutrition values PER CANONICAL UNIT (e.g. kcal per gram), read off the label
  // photo. null = not filled in yet. See drizzle/.../nutrition-counter design.
  calories: real("calories"),
  fatG: real("fat_g"),
  satFatG: real("sat_fat_g"),
  transFatG: real("trans_fat_g"),
  cholesterolMg: real("cholesterol_mg"),
  sodiumMg: real("sodium_mg"),
  carbsG: real("carbs_g"),
  fiberG: real("fiber_g"),
  sugarG: real("sugar_g"),
  addedSugarG: real("added_sugar_g"),
  proteinG: real("protein_g"),
  polyFatG: real("poly_fat_g"),
  monoFatG: real("mono_fat_g"),
  // micronutrients, also per canonical unit
  vitaminDMcg: real("vitamin_d_mcg"),
  calciumMg: real("calcium_mg"),
  ironMg: real("iron_mg"),
  potassiumMg: real("potassium_mg"),
  vitaminAMcg: real("vitamin_a_mcg"),
  vitaminCMg: real("vitamin_c_mg"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// An assorted product (e.g. a trail-mix bag) can carry several nutrition
// profiles — one per assorted type. Values are PER CANONICAL UNIT of the parent
// product's ingredient (use unit 'count' so one packet = one unit = one serving).
// null on a field = not filled in yet, same convention as products.
export const productVariants = sqliteTable("product_variants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  productId: integer("product_id").notNull().references(() => products.id),
  name: text("name").notNull(),
  nutritionPhoto: text("nutrition_photo"),
  // one packet/serving in the parent ingredient's canonical unit (e.g. 43 g).
  // Nutrient columns below are PER CANONICAL UNIT; the editor enters per-serving
  // and divides by this. null = treat 1 unit as 1 serving (count-based packs).
  servingSize: real("serving_size"),
  calories: real("calories"),
  fatG: real("fat_g"),
  satFatG: real("sat_fat_g"),
  transFatG: real("trans_fat_g"),
  cholesterolMg: real("cholesterol_mg"),
  sodiumMg: real("sodium_mg"),
  carbsG: real("carbs_g"),
  fiberG: real("fiber_g"),
  sugarG: real("sugar_g"),
  addedSugarG: real("added_sugar_g"),
  proteinG: real("protein_g"),
  polyFatG: real("poly_fat_g"),
  monoFatG: real("mono_fat_g"),
  vitaminDMcg: real("vitamin_d_mcg"),
  calciumMg: real("calcium_mg"),
  ironMg: real("iron_mg"),
  potassiumMg: real("potassium_mg"),
  vitaminAMcg: real("vitamin_a_mcg"),
  vitaminCMg: real("vitamin_c_mg"),
});

// The quick eat-log: one row per packet (or count) eaten on a date. variantId
// names which nutrition profile when the product is assorted; null = the
// product's own nutrition. Pairs with an 'eaten' stock movement that depletes
// the product.
export const consumptions = sqliteTable("consumptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  date: text("date").notNull(), // YYYY-MM-DD, local date-only (no tz games)
  productId: integer("product_id").notNull().references(() => products.id),
  variantId: integer("variant_id").references(() => productVariants.id),
  count: integer("count").notNull().default(1), // canonical units eaten
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  name: text("name").notNull(),
  baseServings: integer("base_servings").notNull().default(1),
  notes: text("notes"),
  totalMinutes: integer("total_minutes"),
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
  startSeconds: integer("start_seconds"),
  endSeconds: integer("end_seconds"),
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
  // set when this row was generated by a recurring rule; null = manual
  ruleId: integer("rule_id").references(() => mealRules.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// A recurring rule: "this recipe in this slot, on these days, until then".
export const mealRules = sqliteTable("meal_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  slotId: integer("slot_id").notNull().references(() => mealSlots.id),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  servings: integer("servings").notNull().default(1),
  // recurrence: every `intervalN` `unit`s
  intervalN: integer("interval_n").notNull().default(1),
  unit: text("unit").notNull().default("week"), // 'day' | 'week'
  // 7-char mask, index 0=Sun..6=Sat, e.g. "1011000". Ignored when unit='day'.
  daysOfWeek: text("days_of_week").notNull().default("1111111"),
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  untilDate: text("until_date"), // YYYY-MM-DD | null = open-ended
  // furthest date materialized so far; drives top-up. null = nothing yet.
  generatedThrough: text("generated_through"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// A day the user opted out of a rule (deleted the generated meal); never regenerated.
export const mealRuleSkips = sqliteTable("meal_rule_skips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: integer("rule_id").notNull().references(() => mealRules.id),
  date: text("date").notNull(), // YYYY-MM-DD
  slotId: integer("slot_id").notNull().references(() => mealSlots.id),
});

export const stockMovements = sqliteTable("stock_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredients.id),
  // which product these units are; null = unattributed (pre-migration / untagged backfill)
  productId: integer("product_id").references(() => products.id),
  // signed canonical units: + purchase, - cooked, +/- manual
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(), // 'purchase' | 'cooked' | 'manual' | 'eaten'
  mealEventId: integer("meal_event_id").references(() => mealEvents.id),
  purchaseId: integer("purchase_id"),
  at: integer("at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  // date-only YYYY-MM-DD for manual backfill of on-hand stock; null = no expiry
  expiresAt: text("expires_at"),
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

// Manually-added shopping-list lines (not derived from meal plans).
// Either a tracked product (productId set) or a one-off untracked item (title set).
export const shoppingExtras = sqliteTable("shopping_extras", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id),
  // tracked: pick a product → checking it off records a real purchase + restock
  productId: integer("product_id").references(() => products.id),
  // one-off: free-text item not in the system (e.g. a Costco impulse buy)
  title: text("title"),
  // which stop it belongs to; for product lines we derive from the product instead
  shopId: integer("shop_id").references(() => shops.id),
  quantity: integer("quantity").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
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

// One row per household: daily calorie + macro targets for the Analysis tab.
export const nutritionGoals = sqliteTable("nutrition_goals", {
  householdId: integer("household_id")
    .primaryKey()
    .references(() => households.id),
  calorieGoal: integer("calorie_goal").notNull(),
  proteinG: integer("protein_g").notNull(),
  carbsG: integer("carbs_g").notNull(),
  fatG: integer("fat_g").notNull(),
});
