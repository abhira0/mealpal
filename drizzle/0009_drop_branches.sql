PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`ingredient_id` integer NOT NULL,
	`shop_id` integer NOT NULL,
	`name` text NOT NULL,
	`pack_size` integer NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`available` integer DEFAULT true NOT NULL,
	`url` text,
	`created_at` integer NOT NULL,
	`image_url` text,
	`price_cents` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_products`(`id`, `household_id`, `ingredient_id`, `shop_id`, `name`, `pack_size`, `priority`, `available`, `url`, `created_at`, `image_url`, `price_cents`) SELECT `id`, `household_id`, `ingredient_id`, `shop_id`, `name`, `pack_size`, `priority`, `available`, `url`, `created_at`, `image_url`, `price_cents` FROM `products`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP TABLE `branches`;
