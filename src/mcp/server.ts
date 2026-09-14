#!/usr/bin/env -S npx tsx
/**
 * Platr MCP server (read-only) — stdio transport.
 *
 * Reads whatever DATABASE_URL points at, exactly like the web app: run it from
 * the repo and it sees the dev database; run it on the server with the prod
 * DATABASE_URL and it sees prod. Registration only — the queries live in
 * ./tools.ts so they're testable without a transport.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { db } from "@/db";
import {
  findRecipe, getAgenda, getDay, getDayIngredients, getShopping, getStock,
  getWeek, resolveHousehold,
} from "@/mcp/tools";

let hid: number;
try {
  hid = resolveHousehold(db, process.env.PLATR_HOUSEHOLD_ID);
} catch (err) {
  // stderr, never stdout — stdout is the JSON-RPC channel.
  console.error(`platr-mcp: ${(err as Error).message}`);
  process.exit(1);
}

const server = new McpServer({ name: "platr", version: "1.0.0" });

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  .describe("ISO date (YYYY-MM-DD). Omit for today.");

/** Tools return JSON; MCP wants text content, so stringify once here. */
const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

server.registerTool("get_day", {
  description:
    "A day's food log with macros per meal and day totals against the user's goals. "
    + "Call this first for any question about how a day went — 'am I good today', "
    + "'did I hit my protein', 'what did I eat'. Covers recipe meals, batch-prep "
    + "servings, and quick-logged packets in one call. Check `missingNutritionFor`: "
    + "if it's non-empty the totals UNDERCOUNT and you should say so.",
  inputSchema: { date },
}, async ({ date }) => json(getDay(db, hid, date)));

server.registerTool("get_day_ingredients", {
  description:
    "Every ingredient eaten on a day and what each one contributed, sorted by the "
    + "nutrient you pass. Call this when the user asks WHY a number is high or low, "
    + "or wants to know what to cut — get_day tells you the day was 40g over on fat, "
    + "this tells you which ingredients account for it. Rolls up across all meals, "
    + "so one ingredient used in two meals appears once with the combined total.",
  inputSchema: {
    date,
    sortBy: z.enum(["calories", "fatG", "proteinG", "carbsG", "sodiumMg"]).optional()
      .describe("Nutrient to sort by, descending. Defaults to calories."),
  },
}, async ({ date, sortBy }) => json(getDayIngredients(db, hid, date, sortBy)));

server.registerTool("get_week", {
  description:
    "A Mon–Sun week: daily average against goals plus each day's totals. Call this "
    + "for trends and consistency questions — 'how was my week', 'am I averaging "
    + "enough protein', 'which day was worst'. Averages ignore days with no meals "
    + "logged, so a partial week reads correctly. Pass any date in the week.",
  inputSchema: { date },
}, async ({ date }) => json(getWeek(db, hid, date)));

server.registerTool("get_agenda", {
  description:
    "The meal plan going forward: what's scheduled per slot per day, which meals "
    + "come from an existing prep batch, which are short on ingredients, and when a "
    + "batch runs dry and needs cooking again. Call this for 'what am I eating "
    + "tomorrow', 'what do I need to cook', 'what's left in the fridge batches'. "
    + "This is the PLAN — for what was actually eaten, use get_day.",
  inputSchema: {
    from: date,
    days: z.number().int().min(1).max(31).optional().describe("How many days to return. Default 7."),
  },
}, async ({ from, days }) => json(getAgenda(db, hid, from, days)));

server.registerTool("get_stock", {
  description:
    "Current pantry and fridge stock per ingredient, with expiry dates and the date "
    + "the meal plan burns through each one. Call this for 'do I have X', 'what's "
    + "about to expire', 'what am I about to run out of'. Sorted soonest-run-out "
    + "first. `runsOutOn: null` means it lasts beyond the 30-day horizon.",
  inputSchema: {
    includeZero: z.boolean().optional()
      .describe("Include ingredients at zero stock. Default false."),
  },
}, async ({ includeZero }) => json(getStock(db, hid, includeZero)));

server.registerTool("get_shopping", {
  description:
    "What to buy, grouped by shop, to cover the meal plan over the next N days — "
    + "already adjusted for stock on hand and for stock that will spoil before the "
    + "plan uses it. Call this for 'what do I need to buy', 'what's on my Costco "
    + "list', or 'how much will this cost'. Includes manually-added items (marked "
    + "manuallyAdded). Each line, each shop, and the trip as a whole carry an "
    + "estCents cost estimate from the product's price — null wherever a price "
    + "isn't on file yet, rather than silently reading as free.",
  inputSchema: {
    horizonDays: z.number().int().min(1).max(90).optional()
      .describe("Days of plan to cover. Default 14."),
  },
}, async ({ horizonDays }) => json(getShopping(db, hid, horizonDays)));

server.registerTool("find_recipe", {
  description:
    "Look up one recipe by name (case-insensitive substring match) and get its "
    + "ingredients with per-serving amounts, per-ingredient nutrition, steps, and "
    + "per-serving totals. Call this to answer 'what's in X', 'how much oil is in "
    + "X', or before suggesting a change to a recipe. If the name matches several "
    + "recipes it returns the candidates; if none, it returns every recipe name so "
    + "you can retry with a real one.",
  inputSchema: { query: z.string().describe("Recipe name or part of one.") },
}, async ({ query }) => json(findRecipe(db, hid, query)));

// Wrapped rather than top-level await: the project has no "type": "module",
// so tsx transpiles this to CJS where top-level await is a build error.
server.connect(new StdioServerTransport()).catch((err) => {
  console.error(`platr-mcp: ${err}`);
  process.exit(1);
});
