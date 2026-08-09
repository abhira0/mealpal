CREATE TABLE `batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`slot_id` integer NOT NULL,
	`label` text NOT NULL,
	`cooked_date` text NOT NULL,
	`meals_total` integer NOT NULL,
	`meals_remaining` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`),
	FOREIGN KEY (`slot_id`) REFERENCES `meal_slots`(`id`)
);
--> statement-breakpoint
CREATE TABLE `batch_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`recipe_id` integer,
	`product_id` integer,
	`variant_id` integer,
	`ingredient_id` integer,
	`amount` real,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`),
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`),
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`)
);
--> statement-breakpoint
CREATE TABLE `batch_eaten` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`batch_id` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`),
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`)
);
