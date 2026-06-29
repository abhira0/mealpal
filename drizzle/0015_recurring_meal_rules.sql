CREATE TABLE `meal_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`slot_id` integer NOT NULL,
	`recipe_id` integer NOT NULL,
	`servings` integer DEFAULT 1 NOT NULL,
	`interval_n` integer DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'week' NOT NULL,
	`days_of_week` text DEFAULT '1111111' NOT NULL,
	`start_date` text NOT NULL,
	`until_date` text,
	`generated_through` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `meal_slots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meal_rule_skips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` integer NOT NULL,
	`date` text NOT NULL,
	`slot_id` integer NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `meal_rules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `meal_slots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `meal_events` ADD `rule_id` integer REFERENCES meal_rules(id);
