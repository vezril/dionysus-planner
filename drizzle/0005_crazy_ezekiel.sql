CREATE TABLE `ingredient_micronutrient` (
	`ingredientId` integer NOT NULL,
	`nutrientKey` text NOT NULL,
	`amountPerRef` real NOT NULL,
	PRIMARY KEY(`ingredientId`, `nutrientKey`),
	FOREIGN KEY (`ingredientId`) REFERENCES `ingredient`(`id`) ON UPDATE no action ON DELETE cascade
);
