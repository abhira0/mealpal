CREATE TABLE `nutrition_goals` (
	`household_id` integer PRIMARY KEY NOT NULL,
	`calorie_goal` integer NOT NULL,
	`protein_g` integer NOT NULL,
	`carbs_g` integer NOT NULL,
	`fat_g` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
