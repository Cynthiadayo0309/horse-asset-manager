ALTER TABLE `horses` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_horses_user_sort_order` ON `horses` (`user_id`,`sort_order`);
