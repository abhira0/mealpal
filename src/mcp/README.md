# Platr MCP server

Read-only access to Platr from Claude Desktop or Claude Code. No API key — it
runs on your own machine over stdio and talks straight to the database, so it
costs nothing beyond the Claude subscription you already have.

## Setup

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(Claude Desktop) — create the file if it doesn't exist:

```json
{
  "mcpServers": {
    "platr": {
      "command": "npm",
      "args": ["--silent", "--prefix", "/Users/abhishekr/git_repos/platr", "run", "mcp"],
      "env": { "PLATR_HOUSEHOLD_ID": "8" }
    }
  }
}
```

Restart Claude Desktop. For Claude Code: `claude mcp add platr -- npm --silent
--prefix /Users/abhishekr/git_repos/platr run mcp`.

`npm --prefix` matters: it runs the script with cwd set to the repo, which is
what makes the `@/…` import alias and the default `./platr.db` path resolve.
Launching `npx tsx src/mcp/server.ts` directly only works if the client happens
to start it from the repo root.

### Which database

`DATABASE_URL`, exactly like the web app — unset means `./platr.db` in the
repo. To point at prod instead, add it to the `env` block above as an absolute
path, or run the server on asus-server where it's already set.

### Which household

`PLATR_HOUSEHOLD_ID` picks one. Omit it and the server uses the only
household — but the dev database has 12, so set it there (yours is `8`, "Demo
Household"). A wrong or missing id fails at startup with the list of valid ones
rather than silently answering about someone else's food.

## Tools

| Tool | Use it for |
|---|---|
| `get_day` | "Am I good today?" — meals, macros, totals vs goals |
| `get_day_ingredients` | "What's driving the fat?" — per-ingredient contribution, sortable |
| `get_week` | Trends — daily average vs goals, per-day totals |
| `get_agenda` | The plan ahead — scheduled meals, batch servings left, cook-by dates |
| `get_stock` | Pantry — quantities, expiry, predicted run-out |
| `get_shopping` | Buy list by shop, stock- and spoilage-adjusted |
| `find_recipe` | One recipe — ingredients, per-serving nutrition, steps |

Everything is read-only: `tools.ts` imports no mutating function, so there is no
write path. Log meals in the app.

## Structure

- `tools.ts` — the queries. Plain functions over `db`, returning JSON. No MCP
  types, so they're testable directly (`tools.test.ts`).
- `server.ts` — registration and stdio transport. No logic.

Business logic stays in `src/lib/`; these are wrappers that flatten and round
for an LLM reader. If a number looks wrong, fix it in `src/lib/` so the web app
gets the fix too.

## Gotcha worth knowing

`getGoals` returns `DEFAULT_GOALS` (2000/150/220/65) when a household has no
`nutrition_goals` row, so goal comparisons can look plausible while being
generic. `get_day` reports the goal it used — check it if the numbers surprise
you.
