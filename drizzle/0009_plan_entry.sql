CREATE TABLE `plan_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`recipeId` integer NOT NULL,
	`portions` real NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`recipeId`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
