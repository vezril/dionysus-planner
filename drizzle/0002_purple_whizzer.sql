ALTER TABLE `ingredient` ADD `brand` text;--> statement-breakpoint
ALTER TABLE `ingredient` ADD `barcode` text;--> statement-breakpoint
ALTER TABLE `ingredient` ADD `packageQuantity` real;--> statement-breakpoint
ALTER TABLE `ingredient` ADD `packageUnit` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ingredient_barcode_unique` ON `ingredient` (`barcode`);