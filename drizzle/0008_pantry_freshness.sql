ALTER TABLE `ingredient` ADD `shelfLifeDays` real;--> statement-breakpoint
ALTER TABLE `pantry_item` ADD `stockedAt` text;--> statement-breakpoint
-- Backfill: existing rows are "stocked" as of their last update — the best
-- information available (openspec: pantry-freshness).
UPDATE `pantry_item` SET `stockedAt` = `updatedAt` WHERE `stockedAt` IS NULL;
