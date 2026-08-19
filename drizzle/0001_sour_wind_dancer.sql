CREATE TABLE `purchase` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ingredientId` integer NOT NULL,
	`price` real NOT NULL,
	`store` text,
	`displayQuantity` real,
	`displayUnit` text,
	`purchasedAt` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`ingredientId`) REFERENCES `ingredient`(`id`) ON UPDATE no action ON DELETE cascade
);
