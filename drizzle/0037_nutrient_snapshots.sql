-- Freeze the per-unit nutrition label a meal was actually cooked/logged with,
-- so later label edits re-value only future meals, not history. JSON blob of
-- the nutrient columns (variant's if it has any, else the product's); null on
-- pre-existing rows, which keep falling back to the live product.
ALTER TABLE `stock_movements` ADD `nutrients_json` text;
--> statement-breakpoint
ALTER TABLE `consumptions` ADD `nutrients_json` text;
