ALTER TABLE `meal_slots` ADD `time_of_day` text DEFAULT '12:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_slots` DROP COLUMN `position`;