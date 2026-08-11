CREATE TABLE `alert_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`rule_type` text NOT NULL,
	`condition_json` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`notify_via` text DEFAULT 'in_app' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_alert_rules_user_type` ON `alert_rules` (`user_id`,`rule_type`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer,
	`changes_json` text,
	`ip_address` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_user_entity` ON `audit_logs` (`user_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`budget_type` text NOT NULL,
	`period_key` text NOT NULL,
	`amount_yen` integer NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_budgets_amount_nonnegative" CHECK("budgets"."amount_yen" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_budgets_user_type_period` ON `budgets` (`user_id`,`budget_type`,`period_key`);--> statement-breakpoint
CREATE INDEX `idx_budgets_user_period` ON `budgets` (`user_id`,`period_key`);--> statement-breakpoint
CREATE TABLE `cashflow_reconciliations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`scheduled_cashflow_id` integer,
	`cashflow_id` integer,
	`match_type` text NOT NULL,
	`difference_yen` integer,
	`reason` text,
	`status` text DEFAULT 'open' NOT NULL,
	`matched_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`scheduled_cashflow_id`) REFERENCES `scheduled_cashflows`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cashflow_id`) REFERENCES `cashflows`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_reconciliations_has_side" CHECK("cashflow_reconciliations"."scheduled_cashflow_id" IS NOT NULL OR "cashflow_reconciliations"."cashflow_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reconciliations_scheduled` ON `cashflow_reconciliations` (`scheduled_cashflow_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reconciliations_cashflow` ON `cashflow_reconciliations` (`cashflow_id`);--> statement-breakpoint
CREATE INDEX `idx_reconciliations_user_status` ON `cashflow_reconciliations` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `cashflows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`horse_id` integer,
	`club_id` integer,
	`category_id` integer NOT NULL,
	`direction` text NOT NULL,
	`title` text NOT NULL,
	`amount_yen` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`target_month` text NOT NULL,
	`payment_method` text,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`horse_id`) REFERENCES `horses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_cashflows_amount_nonnegative" CHECK("cashflows"."amount_yen" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_cashflows_user_target_status` ON `cashflows` (`user_id`,`target_month`,`status`);--> statement-breakpoint
CREATE INDEX `idx_cashflows_user_occurred` ON `cashflows` (`user_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `idx_cashflows_user_horse` ON `cashflows` (`user_id`,`horse_id`);--> statement-breakpoint
CREATE INDEX `idx_cashflows_user_club` ON `cashflows` (`user_id`,`club_id`);--> statement-breakpoint
CREATE INDEX `idx_cashflows_user_category` ON `cashflows` (`user_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`category_type` text NOT NULL,
	`system_code` text,
	`parent_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_categories_user_type_name` ON `categories` (`user_id`,`category_type`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_categories_user_system_code` ON `categories` (`user_id`,`system_code`);--> statement-breakpoint
CREATE INDEX `idx_categories_user_type_status` ON `categories` (`user_id`,`category_type`,`status`);--> statement-breakpoint
CREATE TABLE `clubs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`short_name` text,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_clubs_user_name` ON `clubs` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_clubs_user_status` ON `clubs` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `horse_settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`horse_id` integer NOT NULL,
	`cashflow_id` integer,
	`settlement_type` text NOT NULL,
	`direction` text NOT NULL,
	`amount_yen` integer NOT NULL,
	`planned_on` text,
	`settled_on` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`horse_id`) REFERENCES `horses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cashflow_id`) REFERENCES `cashflows`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_horse_settlements_amount_nonnegative" CHECK("horse_settlements"."amount_yen" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_horse_settlements_cashflow` ON `horse_settlements` (`cashflow_id`);--> statement-breakpoint
CREATE INDEX `idx_horse_settlements_user_horse` ON `horse_settlements` (`user_id`,`horse_id`);--> statement-breakpoint
CREATE TABLE `horses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`club_id` integer,
	`name` text NOT NULL,
	`name_kana` text,
	`gender` text,
	`birth_date` text,
	`sire` text,
	`dam` text,
	`damsire` text,
	`trainer` text,
	`recruitment_year` integer,
	`total_price_yen` integer,
	`total_shares` integer,
	`unit_price_yen` integer,
	`planned_shares` integer,
	`initial_payment_yen` integer,
	`expected_monthly_cost_yen` integer,
	`expected_insurance_yen` integer,
	`application_deadline` text,
	`status` text DEFAULT 'considering' NOT NULL,
	`retired_on` text,
	`settled_on` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_horses_total_price_nonnegative" CHECK("horses"."total_price_yen" IS NULL OR "horses"."total_price_yen" >= 0),
	CONSTRAINT "ck_horses_unit_price_nonnegative" CHECK("horses"."unit_price_yen" IS NULL OR "horses"."unit_price_yen" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_horses_user_status` ON `horses` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_horses_user_club` ON `horses` (`user_id`,`club_id`);--> statement-breakpoint
CREATE INDEX `idx_horses_user_deadline` ON `horses` (`user_id`,`application_deadline`);--> statement-breakpoint
CREATE TABLE `investments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`horse_id` integer NOT NULL,
	`shares` integer NOT NULL,
	`unit_price_yen` integer NOT NULL,
	`committed_amount_yen` integer NOT NULL,
	`joined_on` text,
	`note` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`horse_id`) REFERENCES `horses`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_investments_shares_positive" CHECK("investments"."shares" > 0),
	CONSTRAINT "ck_investments_unit_price_nonnegative" CHECK("investments"."unit_price_yen" >= 0),
	CONSTRAINT "ck_investments_amount_nonnegative" CHECK("investments"."committed_amount_yen" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_investments_user_horse` ON `investments` (`user_id`,`horse_id`);--> statement-breakpoint
CREATE INDEX `idx_investments_user` ON `investments` (`user_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`alert_rule_id` integer,
	`dedupe_key` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`severity` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`alert_rule_id`) REFERENCES `alert_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notifications_user_dedupe` ON `notifications` (`user_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user_read_created` ON `notifications` (`user_id`,`is_read`,`created_at`);--> statement-breakpoint
CREATE TABLE `recurring_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`horse_id` integer,
	`club_id` integer,
	`category_id` integer NOT NULL,
	`direction` text DEFAULT 'expense' NOT NULL,
	`title` text NOT NULL,
	`amount_yen` integer NOT NULL,
	`frequency` text NOT NULL,
	`day_of_month` integer NOT NULL,
	`start_month` text NOT NULL,
	`end_month` text,
	`generated_through_month` text,
	`status` text DEFAULT 'active' NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`horse_id`) REFERENCES `horses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_recurring_rules_amount_nonnegative" CHECK("recurring_rules"."amount_yen" >= 0),
	CONSTRAINT "ck_recurring_rules_day" CHECK("recurring_rules"."day_of_month" BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE INDEX `idx_recurring_rules_user_status` ON `recurring_rules` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_recurring_rules_generation` ON `recurring_rules` (`status`,`generated_through_month`);--> statement-breakpoint
CREATE TABLE `scheduled_cashflows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`recurring_rule_id` integer,
	`horse_id` integer,
	`club_id` integer,
	`category_id` integer NOT NULL,
	`direction` text NOT NULL,
	`title` text NOT NULL,
	`amount_yen` integer NOT NULL,
	`due_on` text NOT NULL,
	`target_month` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recurring_rule_id`) REFERENCES `recurring_rules`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`horse_id`) REFERENCES `horses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_scheduled_amount_nonnegative" CHECK("scheduled_cashflows"."amount_yen" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scheduled_rule_due` ON `scheduled_cashflows` (`user_id`,`recurring_rule_id`,`due_on`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_user_target_status` ON `scheduled_cashflows` (`user_id`,`target_month`,`status`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_user_due_status` ON `scheduled_cashflows` (`user_id`,`due_on`,`status`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_user_horse` ON `scheduled_cashflows` (`user_id`,`horse_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`last_used_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires_at` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `simulation_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scenario_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`horse_id` integer,
	`title` text NOT NULL,
	`shares` integer DEFAULT 1 NOT NULL,
	`initial_amount_yen` integer DEFAULT 0 NOT NULL,
	`monthly_amount_yen` integer DEFAULT 0 NOT NULL,
	`annual_amount_yen` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `simulation_scenarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`horse_id`) REFERENCES `horses`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_simulation_items_shares_positive" CHECK("simulation_items"."shares" > 0),
	CONSTRAINT "ck_simulation_items_initial_nonnegative" CHECK("simulation_items"."initial_amount_yen" >= 0),
	CONSTRAINT "ck_simulation_items_monthly_nonnegative" CHECK("simulation_items"."monthly_amount_yen" >= 0),
	CONSTRAINT "ck_simulation_items_annual_nonnegative" CHECK("simulation_items"."annual_amount_yen" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_simulation_items_user_scenario` ON `simulation_items` (`user_id`,`scenario_id`);--> statement-breakpoint
CREATE TABLE `simulation_scenarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`start_month` text NOT NULL,
	`assumed_period_months` integer DEFAULT 12 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_simulation_scenarios_user_status` ON `simulation_scenarios` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`setup_completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
PRAGMA optimize;
