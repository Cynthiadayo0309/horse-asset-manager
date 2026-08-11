CREATE TABLE `horse_name_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`horse_id` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`horse_id`) REFERENCES `horses`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_horse_name_aliases_user_horse_name` ON `horse_name_aliases` (`user_id`,`horse_id`,`name`);
--> statement-breakpoint
CREATE INDEX `idx_horse_name_aliases_user_horse` ON `horse_name_aliases` (`user_id`,`horse_id`);
--> statement-breakpoint
CREATE TABLE `statement_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`source_type` text NOT NULL,
	`document_hash` text NOT NULL,
	`target_month` text NOT NULL,
	`destination` text NOT NULL,
	`item_count` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_statement_imports_item_count_positive" CHECK(`item_count` > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_statement_imports_user_hash` ON `statement_imports` (`user_id`,`document_hash`);
--> statement-breakpoint
CREATE INDEX `idx_statement_imports_user_created` ON `statement_imports` (`user_id`,`created_at`);
--> statement-breakpoint
ALTER TABLE `cashflows` ADD COLUMN `statement_import_id` integer REFERENCES `statement_imports`(`id`) ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `cashflows` ADD COLUMN `source_line_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_cashflows_user_import_line` ON `cashflows` (`user_id`,`statement_import_id`,`source_line_key`);
--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD COLUMN `statement_import_id` integer REFERENCES `statement_imports`(`id`) ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `scheduled_cashflows` ADD COLUMN `source_line_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scheduled_user_import_line` ON `scheduled_cashflows` (`user_id`,`statement_import_id`,`source_line_key`);
