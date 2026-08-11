CREATE TABLE `_investment_price_migration_guard` (
	`invalid_count` integer NOT NULL CHECK (`invalid_count` = 0)
);
--> statement-breakpoint
INSERT INTO `_investment_price_migration_guard` (`invalid_count`)
SELECT COUNT(*)
FROM `investments`
WHERE `unit_price_yen` * `shares` <> `committed_amount_yen`
	AND `committed_amount_yen` % `shares` <> 0;
--> statement-breakpoint
INSERT INTO `audit_logs` (
	`user_id`,
	`action`,
	`entity_type`,
	`entity_id`,
	`changes_json`,
	`created_at`
)
SELECT
	`user_id`,
	'update',
	'investments',
	`id`,
	'{"reason":"investment_unit_price_reconciled"}',
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `investments`
WHERE `unit_price_yen` * `shares` <> `committed_amount_yen`
	AND `committed_amount_yen` % `shares` = 0;
--> statement-breakpoint
UPDATE `investments`
SET
	`unit_price_yen` = `committed_amount_yen` / `shares`,
	`updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `unit_price_yen` * `shares` <> `committed_amount_yen`
	AND `committed_amount_yen` % `shares` = 0;
--> statement-breakpoint
DROP TABLE `_investment_price_migration_guard`;
