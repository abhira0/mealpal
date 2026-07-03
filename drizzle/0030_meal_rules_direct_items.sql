-- Let recurring rules carry a direct product or ingredient, not just a recipe.
-- recipe_id becomes nullable (SQLite needs a table rebuild for that); product_id
-- / variant_id / ingredient_id / amount mirror the direct-item fields on meal_events.
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_meal_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`slot_id` integer NOT NULL,
	`recipe_id` integer,
	`product_id` integer,
	`variant_id` integer,
	`ingredient_id` integer,
	`amount` integer,
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
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_meal_rules` (
	`id`, `household_id`, `slot_id`, `recipe_id`, `servings`, `interval_n`, `unit`,
	`days_of_week`, `start_date`, `until_date`, `generated_through`, `created_at`
) SELECT
	`id`, `household_id`, `slot_id`, `recipe_id`, `servings`, `interval_n`, `unit`,
	`days_of_week`, `start_date`, `until_date`, `generated_through`, `created_at`
FROM `meal_rules`;
--> statement-breakpoint
DROP TABLE `meal_rules`;
--> statement-breakpoint
ALTER TABLE `__new_meal_rules` RENAME TO `meal_rules`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
