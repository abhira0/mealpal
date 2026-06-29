PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_meal_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`date` text NOT NULL,
	`slot_id` integer NOT NULL,
	`recipe_id` integer,
	`servings` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` integer NOT NULL,
	`rule_id` integer,
	`ingredient_id` integer,
	`product_id` integer,
	`variant_id` integer,
	`amount` real,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`slot_id`) REFERENCES `meal_slots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `meal_rules`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_meal_events`(`id`, `household_id`, `date`, `slot_id`, `recipe_id`, `servings`, `status`, `created_at`, `rule_id`) SELECT `id`, `household_id`, `date`, `slot_id`, `recipe_id`, `servings`, `status`, `created_at`, `rule_id` FROM `meal_events`;--> statement-breakpoint
DROP TABLE `meal_events`;--> statement-breakpoint
ALTER TABLE `__new_meal_events` RENAME TO `meal_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;