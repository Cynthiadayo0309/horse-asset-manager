ALTER TABLE `cashflows` ADD COLUMN `idempotency_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_cashflows_user_idempotency_key` ON `cashflows` (`user_id`,`idempotency_key`);
