PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_plan_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`kind` text DEFAULT 'cook' NOT NULL,
	`recipeId` integer,
	`batchId` integer,
	`batchLabel` text,
	`portions` real NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`recipeId`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Existing rows predate kinds: they are all cook entries.
INSERT INTO `__new_plan_entry`("id", "date", "kind", "recipeId", "batchId", "batchLabel", "portions", "createdAt") SELECT "id", "date", 'cook', "recipeId", NULL, NULL, "portions", "createdAt" FROM `plan_entry`;--> statement-breakpoint
DROP TABLE `plan_entry`;--> statement-breakpoint
ALTER TABLE `__new_plan_entry` RENAME TO `plan_entry`;--> statement-breakpoint
PRAGMA foreign_keys=ON;