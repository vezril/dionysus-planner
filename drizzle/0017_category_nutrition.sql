CREATE TABLE `category_nutrition` (
	`path` text PRIMARY KEY NOT NULL,
	`displayPath` text NOT NULL,
	`caloriesPerRef` real,
	`proteinPerRef` real,
	`carbsPerRef` real,
	`fatPerRef` real,
	`alcoholAbvPercent` real
);
