-- openspec: count-via-package-size — packageUnit was free text; it now must
-- be a known unit key (domain/units.ts UNITS). Normalize stored values that
-- case-insensitively match a known key; anything else is left as-is and
-- simply never activates package-size resolution.
UPDATE `ingredient` SET `packageUnit` = 'g'    WHERE `packageUnit` IS NOT NULL AND lower(`packageUnit`) = 'g'    AND `packageUnit` <> 'g';--> statement-breakpoint
UPDATE `ingredient` SET `packageUnit` = 'kg'   WHERE `packageUnit` IS NOT NULL AND lower(`packageUnit`) = 'kg'   AND `packageUnit` <> 'kg';--> statement-breakpoint
UPDATE `ingredient` SET `packageUnit` = 'oz'   WHERE `packageUnit` IS NOT NULL AND lower(`packageUnit`) = 'oz'   AND `packageUnit` <> 'oz';--> statement-breakpoint
UPDATE `ingredient` SET `packageUnit` = 'lb'   WHERE `packageUnit` IS NOT NULL AND lower(`packageUnit`) = 'lb'   AND `packageUnit` <> 'lb';--> statement-breakpoint
UPDATE `ingredient` SET `packageUnit` = 'mL'   WHERE `packageUnit` IS NOT NULL AND lower(`packageUnit`) = 'ml'   AND `packageUnit` <> 'mL';--> statement-breakpoint
UPDATE `ingredient` SET `packageUnit` = 'L'    WHERE `packageUnit` IS NOT NULL AND lower(`packageUnit`) = 'l'    AND `packageUnit` <> 'L';--> statement-breakpoint
UPDATE `ingredient` SET `packageUnit` = 'tsp'  WHERE `packageUnit` IS NOT NULL AND lower(`packageUnit`) = 'tsp'  AND `packageUnit` <> 'tsp';--> statement-breakpoint
UPDATE `ingredient` SET `packageUnit` = 'tbsp' WHERE `packageUnit` IS NOT NULL AND lower(`packageUnit`) = 'tbsp' AND `packageUnit` <> 'tbsp';--> statement-breakpoint
UPDATE `ingredient` SET `packageUnit` = 'cup'  WHERE `packageUnit` IS NOT NULL AND lower(`packageUnit`) = 'cup'  AND `packageUnit` <> 'cup';--> statement-breakpoint
UPDATE `ingredient` SET `packageUnit` = 'floz' WHERE `packageUnit` IS NOT NULL AND lower(`packageUnit`) = 'floz' AND `packageUnit` <> 'floz';--> statement-breakpoint
UPDATE `ingredient` SET `packageUnit` = 'each' WHERE `packageUnit` IS NOT NULL AND lower(`packageUnit`) = 'each' AND `packageUnit` <> 'each';
