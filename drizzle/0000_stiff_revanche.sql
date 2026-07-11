CREATE TABLE `ingredient` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`seedKey` text,
	`name` text NOT NULL,
	`unitClass` text NOT NULL,
	`densityGPerMl` real,
	`caloriesPerRef` real NOT NULL,
	`proteinPerRef` real NOT NULL,
	`carbsPerRef` real NOT NULL,
	`fatPerRef` real NOT NULL,
	`fiberPerRef` real,
	`sugarPerRef` real,
	`sodiumMgPerRef` real,
	`source` text NOT NULL,
	`overridden` integer DEFAULT false NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredient_seedKey_unique` ON `ingredient` (`seedKey`);--> statement-breakpoint
CREATE TABLE `pantry_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredientId` integer NOT NULL,
	`quantityCanonical` real NOT NULL,
	`entryUnitClass` text NOT NULL,
	`displayQuantity` real NOT NULL,
	`displayUnit` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`ingredientId`) REFERENCES `ingredient`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pantry_item_ingredientId_unique` ON `pantry_item` (`ingredientId`);--> statement-breakpoint
CREATE TABLE `recipe` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`servings` integer NOT NULL,
	`instructions` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT "recipe_servings_check" CHECK("recipe"."servings" >= 1)
);
--> statement-breakpoint
CREATE TABLE `recipe_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipeId` integer NOT NULL,
	`ingredientId` integer NOT NULL,
	`quantityCanonical` real NOT NULL,
	`entryUnitClass` text NOT NULL,
	`displayQuantity` real NOT NULL,
	`displayUnit` text NOT NULL,
	FOREIGN KEY (`recipeId`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingredientId`) REFERENCES `ingredient`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `recipe_tag` (
	`recipeId` integer NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`recipeId`, `tag`),
	FOREIGN KEY (`recipeId`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
