-- mealpal-a9e: per-household timezone + per-slot prep window, replacing the
-- hardcoded America/Phoenix timezone and Lunch/Dinner/overnight-oats prep
-- times in src/lib/calendar.ts. Default preserves today's one household's
-- behavior byte-for-byte (see calendar.test.ts).
ALTER TABLE `households` ADD `timezone` text DEFAULT 'America/Phoenix' NOT NULL;
--> statement-breakpoint
ALTER TABLE `meal_slots` ADD `prep_start` text;
--> statement-breakpoint
ALTER TABLE `meal_slots` ADD `prep_end` text;
