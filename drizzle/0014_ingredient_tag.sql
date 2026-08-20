CREATE TABLE `ingredient_tag` (
	`ingredientId` integer NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`ingredientId`, `tag`),
	FOREIGN KEY (`ingredientId`) REFERENCES `ingredient`(`id`) ON UPDATE no action ON DELETE cascade
);
