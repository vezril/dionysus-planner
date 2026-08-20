CREATE TABLE `ingredient_link` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredientId` integer NOT NULL,
	`url` text NOT NULL,
	FOREIGN KEY (`ingredientId`) REFERENCES `ingredient`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `recipe` ADD `rating` integer;--> statement-breakpoint
ALTER TABLE `recipe` ADD `variantOfId` integer;