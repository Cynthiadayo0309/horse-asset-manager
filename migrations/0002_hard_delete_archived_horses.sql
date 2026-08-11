ALTER TABLE `audit_logs` ADD COLUMN `subject_horse_id` integer;
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_user_horse` ON `audit_logs` (`user_id`,`subject_horse_id`);
--> statement-breakpoint
UPDATE `audit_logs`
SET `subject_horse_id` = CASE `entity_type`
	WHEN 'horses' THEN COALESCE(
		(SELECT h.id FROM horses h WHERE h.user_id = audit_logs.user_id AND h.id = audit_logs.entity_id),
		(SELECT h.id FROM horses h WHERE h.user_id = audit_logs.user_id AND h.created_at = audit_logs.created_at ORDER BY h.id DESC LIMIT 1)
	)
	WHEN 'investments' THEN (
		SELECT i.horse_id FROM investments i
		WHERE i.user_id = audit_logs.user_id
			AND (i.id = audit_logs.entity_id OR (audit_logs.entity_id IS NULL AND i.created_at = audit_logs.created_at))
		ORDER BY i.id DESC LIMIT 1
	)
	WHEN 'cashflows' THEN (
		SELECT cf.horse_id FROM cashflows cf
		WHERE cf.user_id = audit_logs.user_id
			AND (cf.id = audit_logs.entity_id OR (audit_logs.entity_id IS NULL AND cf.created_at = audit_logs.created_at))
		ORDER BY cf.id DESC LIMIT 1
	)
	WHEN 'recurring_rules' THEN (
		SELECT rr.horse_id FROM recurring_rules rr
		WHERE rr.user_id = audit_logs.user_id
			AND (rr.id = audit_logs.entity_id OR (audit_logs.entity_id IS NULL AND rr.created_at = audit_logs.created_at))
		ORDER BY rr.id DESC LIMIT 1
	)
	WHEN 'scheduled_cashflows' THEN (
		SELECT sc.horse_id FROM scheduled_cashflows sc
		WHERE sc.user_id = audit_logs.user_id
			AND (sc.id = audit_logs.entity_id OR (audit_logs.entity_id IS NULL AND sc.created_at = audit_logs.created_at))
		ORDER BY sc.id DESC LIMIT 1
	)
	WHEN 'horse_settlements' THEN (
		SELECT hs.horse_id FROM horse_settlements hs
		WHERE hs.user_id = audit_logs.user_id
			AND (hs.id = audit_logs.entity_id OR (audit_logs.entity_id IS NULL AND hs.created_at = audit_logs.created_at))
		ORDER BY hs.id DESC LIMIT 1
	)
	WHEN 'cashflow_reconciliations' THEN (
		SELECT COALESCE(sc.horse_id, cf.horse_id)
		FROM cashflow_reconciliations cr
		LEFT JOIN scheduled_cashflows sc ON sc.id = cr.scheduled_cashflow_id AND sc.user_id = cr.user_id
		LEFT JOIN cashflows cf ON cf.id = cr.cashflow_id AND cf.user_id = cr.user_id
		WHERE cr.user_id = audit_logs.user_id
			AND (cr.id = audit_logs.entity_id OR (audit_logs.entity_id IS NULL AND cr.created_at = audit_logs.created_at))
		ORDER BY cr.id DESC LIMIT 1
	)
	ELSE NULL
END
WHERE `subject_horse_id` IS NULL;
--> statement-breakpoint
CREATE TABLE `_archived_horse_deletion_targets` (
	`user_id` integer NOT NULL,
	`horse_id` integer NOT NULL,
	PRIMARY KEY (`user_id`, `horse_id`)
);
--> statement-breakpoint
INSERT INTO `_archived_horse_deletion_targets` (`user_id`, `horse_id`)
SELECT `user_id`, `id`
FROM `horses`
WHERE `status` = 'archived';
--> statement-breakpoint
INSERT INTO `audit_logs` (
	`user_id`,
	`action`,
	`entity_type`,
	`entity_id`,
	`subject_horse_id`,
	`changes_json`,
	`ip_address`,
	`created_at`
)
SELECT
	t.user_id,
	'delete',
	'horse_deletions',
	NULL,
	NULL,
	json_object(
		'horses', COUNT(*),
		'investments', (SELECT COUNT(*) FROM investments i WHERE i.user_id = t.user_id AND i.horse_id IN (SELECT horse_id FROM _archived_horse_deletion_targets WHERE user_id = t.user_id)),
		'cashflows', (SELECT COUNT(*) FROM cashflows cf WHERE cf.user_id = t.user_id AND cf.horse_id IN (SELECT horse_id FROM _archived_horse_deletion_targets WHERE user_id = t.user_id)),
		'recurringRules', (SELECT COUNT(*) FROM recurring_rules rr WHERE rr.user_id = t.user_id AND rr.horse_id IN (SELECT horse_id FROM _archived_horse_deletion_targets WHERE user_id = t.user_id)),
		'scheduledCashflows', (SELECT COUNT(*) FROM scheduled_cashflows sc WHERE sc.user_id = t.user_id AND (sc.horse_id IN (SELECT horse_id FROM _archived_horse_deletion_targets WHERE user_id = t.user_id) OR sc.recurring_rule_id IN (SELECT rr.id FROM recurring_rules rr WHERE rr.user_id = t.user_id AND rr.horse_id IN (SELECT horse_id FROM _archived_horse_deletion_targets WHERE user_id = t.user_id)))),
		'reconciliations', (SELECT COUNT(*) FROM cashflow_reconciliations cr WHERE cr.user_id = t.user_id AND (cr.cashflow_id IN (SELECT cf.id FROM cashflows cf WHERE cf.user_id = t.user_id AND cf.horse_id IN (SELECT horse_id FROM _archived_horse_deletion_targets WHERE user_id = t.user_id)) OR cr.scheduled_cashflow_id IN (SELECT sc.id FROM scheduled_cashflows sc WHERE sc.user_id = t.user_id AND (sc.horse_id IN (SELECT horse_id FROM _archived_horse_deletion_targets WHERE user_id = t.user_id) OR sc.recurring_rule_id IN (SELECT rr.id FROM recurring_rules rr WHERE rr.user_id = t.user_id AND rr.horse_id IN (SELECT horse_id FROM _archived_horse_deletion_targets WHERE user_id = t.user_id)))))),
		'settlements', (SELECT COUNT(*) FROM horse_settlements hs WHERE hs.user_id = t.user_id AND hs.horse_id IN (SELECT horse_id FROM _archived_horse_deletion_targets WHERE user_id = t.user_id)),
		'simulationItems', (SELECT COUNT(*) FROM simulation_items si WHERE si.user_id = t.user_id AND si.horse_id IN (SELECT horse_id FROM _archived_horse_deletion_targets WHERE user_id = t.user_id)),
		'notifications', (SELECT COUNT(*) FROM notifications n WHERE n.user_id = t.user_id AND (EXISTS (SELECT 1 FROM _archived_horse_deletion_targets d WHERE d.user_id = t.user_id AND n.dedupe_key LIKE ('deadline:' || d.horse_id || ':%')) OR EXISTS (SELECT 1 FROM scheduled_cashflows sc WHERE sc.user_id = t.user_id AND (sc.horse_id IN (SELECT horse_id FROM _archived_horse_deletion_targets WHERE user_id = t.user_id) OR sc.recurring_rule_id IN (SELECT rr.id FROM recurring_rules rr WHERE rr.user_id = t.user_id AND rr.horse_id IN (SELECT horse_id FROM _archived_horse_deletion_targets WHERE user_id = t.user_id))) AND (n.dedupe_key LIKE ('due:' || sc.id || ':%') OR n.dedupe_key LIKE ('missing:' || sc.id || ':%'))))),
		'auditLogs', (SELECT COUNT(*) FROM audit_logs al WHERE al.user_id = t.user_id AND al.subject_horse_id IN (SELECT horse_id FROM _archived_horse_deletion_targets WHERE user_id = t.user_id))
	),
	NULL,
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `_archived_horse_deletion_targets` t
GROUP BY t.user_id;
--> statement-breakpoint
DELETE FROM `notifications`
WHERE EXISTS (
	SELECT 1 FROM `_archived_horse_deletion_targets` d
	WHERE d.user_id = notifications.user_id
		AND notifications.dedupe_key LIKE ('deadline:' || d.horse_id || ':%')
)
OR EXISTS (
	SELECT 1 FROM scheduled_cashflows sc
	JOIN `_archived_horse_deletion_targets` d ON d.user_id = sc.user_id
	WHERE sc.user_id = notifications.user_id
		AND (sc.horse_id = d.horse_id OR sc.recurring_rule_id IN (SELECT rr.id FROM recurring_rules rr WHERE rr.user_id = d.user_id AND rr.horse_id = d.horse_id))
		AND (notifications.dedupe_key LIKE ('due:' || sc.id || ':%') OR notifications.dedupe_key LIKE ('missing:' || sc.id || ':%'))
);
--> statement-breakpoint
DELETE FROM `audit_logs`
WHERE (`user_id`, `subject_horse_id`) IN (SELECT `user_id`, `horse_id` FROM `_archived_horse_deletion_targets`);
--> statement-breakpoint
DELETE FROM `cashflow_reconciliations`
WHERE (`user_id`, `cashflow_id`) IN (
	SELECT cf.user_id, cf.id FROM cashflows cf
	JOIN `_archived_horse_deletion_targets` d ON d.user_id = cf.user_id AND d.horse_id = cf.horse_id
)
OR (`user_id`, `scheduled_cashflow_id`) IN (
	SELECT sc.user_id, sc.id FROM scheduled_cashflows sc
	JOIN `_archived_horse_deletion_targets` d ON d.user_id = sc.user_id
	WHERE sc.horse_id = d.horse_id
		OR sc.recurring_rule_id IN (SELECT rr.id FROM recurring_rules rr WHERE rr.user_id = d.user_id AND rr.horse_id = d.horse_id)
);
--> statement-breakpoint
DELETE FROM `horse_settlements`
WHERE (`user_id`, `horse_id`) IN (SELECT `user_id`, `horse_id` FROM `_archived_horse_deletion_targets`);
--> statement-breakpoint
DELETE FROM `scheduled_cashflows`
WHERE (`user_id`, `horse_id`) IN (SELECT `user_id`, `horse_id` FROM `_archived_horse_deletion_targets`)
	OR (`user_id`, `recurring_rule_id`) IN (
		SELECT rr.user_id, rr.id FROM recurring_rules rr
		JOIN `_archived_horse_deletion_targets` d ON d.user_id = rr.user_id AND d.horse_id = rr.horse_id
	);
--> statement-breakpoint
DELETE FROM `recurring_rules`
WHERE (`user_id`, `horse_id`) IN (SELECT `user_id`, `horse_id` FROM `_archived_horse_deletion_targets`);
--> statement-breakpoint
DELETE FROM `simulation_items`
WHERE (`user_id`, `horse_id`) IN (SELECT `user_id`, `horse_id` FROM `_archived_horse_deletion_targets`);
--> statement-breakpoint
DELETE FROM `cashflows`
WHERE (`user_id`, `horse_id`) IN (SELECT `user_id`, `horse_id` FROM `_archived_horse_deletion_targets`);
--> statement-breakpoint
DELETE FROM `investments`
WHERE (`user_id`, `horse_id`) IN (SELECT `user_id`, `horse_id` FROM `_archived_horse_deletion_targets`);
--> statement-breakpoint
DELETE FROM `horses`
WHERE (`user_id`, `id`) IN (SELECT `user_id`, `horse_id` FROM `_archived_horse_deletion_targets`);
--> statement-breakpoint
DROP TABLE `_archived_horse_deletion_targets`;
