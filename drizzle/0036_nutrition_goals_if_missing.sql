-- 0011_add_nutrition_goals.sql was never applied: its filename collides with
-- 0011_demo_seed in meta/_journal.json, so the migrator skipped it and a fresh
-- database has no nutrition_goals table. getGoals() then throws on select
-- rather than falling back to DEFAULT_GOALS, taking the nutrition page with it.
-- IF NOT EXISTS so this is a no-op on databases where the table was added by hand.
CREATE TABLE IF NOT EXISTS `nutrition_goals` (
	`household_id` integer PRIMARY KEY NOT NULL,
	`calorie_goal` integer NOT NULL,
	`protein_g` integer NOT NULL,
	`carbs_g` integer NOT NULL,
	`fat_g` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
