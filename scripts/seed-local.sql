-- Local development data only. Never apply this file to a remote D1 database.
INSERT INTO users (email, name, password_hash, role, status, setup_completed, created_at, updated_at)
VALUES ('local-demo@example.com', 'ローカルデモ', 'pbkdf2-sha256$v1$100000$wYFTILgu3qLOA8yD3MkU0g$UkpjEzbFakIsi75MA9QmIOgsACa0IB1KjtTjjgfmEDk', 'user', 'active', 1, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')
ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at;

INSERT OR IGNORE INTO categories (user_id, name, category_type, system_code, sort_order, status, created_at, updated_at)
SELECT id, '出資金', 'expense', 'investment_principal', 0, 'active', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users WHERE email = 'local-demo@example.com';
INSERT OR IGNORE INTO categories (user_id, name, category_type, system_code, sort_order, status, created_at, updated_at)
SELECT id, '維持費', 'expense', 'maintenance', 1, 'active', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users WHERE email = 'local-demo@example.com';
INSERT OR IGNORE INTO categories (user_id, name, category_type, system_code, sort_order, status, created_at, updated_at)
SELECT id, 'クラブ会費', 'expense', 'club_fee', 2, 'active', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users WHERE email = 'local-demo@example.com';
INSERT OR IGNORE INTO categories (user_id, name, category_type, system_code, sort_order, status, created_at, updated_at)
SELECT id, '保険料', 'expense', 'insurance', 3, 'active', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users WHERE email = 'local-demo@example.com';
INSERT OR IGNORE INTO categories (user_id, name, category_type, system_code, sort_order, status, created_at, updated_at)
SELECT id, 'その他支出', 'expense', 'other_expense', 4, 'active', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users WHERE email = 'local-demo@example.com';
INSERT OR IGNORE INTO categories (user_id, name, category_type, system_code, sort_order, status, created_at, updated_at)
SELECT id, '賞金分配', 'income', 'prize_distribution', 10, 'active', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users WHERE email = 'local-demo@example.com';
INSERT OR IGNORE INTO categories (user_id, name, category_type, system_code, sort_order, status, created_at, updated_at)
SELECT id, 'その他入金', 'income', 'other_income', 11, 'active', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users WHERE email = 'local-demo@example.com';

INSERT INTO clubs (user_id, name, short_name, description, status, created_at, updated_at)
SELECT id, 'サンプルクラブ', 'サンプル', 'ローカル確認用データ', 'active', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users u
WHERE email = 'local-demo@example.com' AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.user_id = u.id AND c.name = 'サンプルクラブ');
INSERT OR IGNORE INTO budgets (user_id, budget_type, period_key, amount_yen, note, created_at, updated_at)
SELECT id, 'yearly', '2026', 600000, 'ローカルデモ', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users WHERE email = 'local-demo@example.com';

INSERT INTO horses (user_id, club_id, name, recruitment_year, unit_price_yen, planned_shares, expected_monthly_cost_yen, status, note, created_at, updated_at)
SELECT u.id, c.id, 'サンプルホース', 2026, 50000, 1, 3500, 'active', '画面確認用', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
FROM users u JOIN clubs c ON c.user_id = u.id AND c.name = 'サンプルクラブ'
WHERE u.email = 'local-demo@example.com' AND NOT EXISTS (SELECT 1 FROM horses h WHERE h.user_id = u.id AND h.name = 'サンプルホース');

INSERT INTO cashflows (user_id, horse_id, club_id, category_id, direction, title, amount_yen, occurred_on, target_month, status, created_at, updated_at)
SELECT u.id, h.id, c.id, cat.id, 'expense', '初回出資金', 50000, '2026-08-01', '2026-08', 'confirmed', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
FROM users u JOIN horses h ON h.user_id = u.id AND h.name = 'サンプルホース' JOIN clubs c ON c.id = h.club_id JOIN categories cat ON cat.user_id = u.id AND cat.system_code = 'investment_principal'
WHERE u.email = 'local-demo@example.com' AND NOT EXISTS (SELECT 1 FROM cashflows cf WHERE cf.user_id = u.id AND cf.title = '初回出資金' AND cf.occurred_on = '2026-08-01');

INSERT OR IGNORE INTO investments (user_id, horse_id, shares, unit_price_yen, committed_amount_yen, joined_on, note, created_at, updated_at)
SELECT u.id, h.id, 1, 50000, 50000, '2026-08-01', 'ローカルデモ', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
FROM users u JOIN horses h ON h.user_id = u.id AND h.name = 'サンプルホース' WHERE u.email = 'local-demo@example.com';

INSERT INTO alert_rules (user_id, rule_type, condition_json, is_enabled, notify_via, created_at, updated_at)
SELECT id, 'due_date', '{"daysBefore":7}', 1, 'in_app', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users u WHERE email = 'local-demo@example.com' AND NOT EXISTS (SELECT 1 FROM alert_rules a WHERE a.user_id = u.id AND a.rule_type = 'due_date');
INSERT INTO alert_rules (user_id, rule_type, condition_json, is_enabled, notify_via, created_at, updated_at)
SELECT id, 'deadline', '{"daysBefore":14}', 1, 'in_app', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users u WHERE email = 'local-demo@example.com' AND NOT EXISTS (SELECT 1 FROM alert_rules a WHERE a.user_id = u.id AND a.rule_type = 'deadline');
INSERT INTO alert_rules (user_id, rule_type, condition_json, is_enabled, notify_via, created_at, updated_at)
SELECT id, 'budget', '{"warningPercent":90,"errorPercent":100}', 1, 'in_app', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users u WHERE email = 'local-demo@example.com' AND NOT EXISTS (SELECT 1 FROM alert_rules a WHERE a.user_id = u.id AND a.rule_type = 'budget');
INSERT INTO alert_rules (user_id, rule_type, condition_json, is_enabled, notify_via, created_at, updated_at)
SELECT id, 'input_missing', '{"daysAfter":7}', 1, 'in_app', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users u WHERE email = 'local-demo@example.com' AND NOT EXISTS (SELECT 1 FROM alert_rules a WHERE a.user_id = u.id AND a.rule_type = 'input_missing');
INSERT INTO alert_rules (user_id, rule_type, condition_json, is_enabled, notify_via, created_at, updated_at)
SELECT id, 'concentration', '{"thresholdPercent":50}', 1, 'in_app', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z' FROM users u WHERE email = 'local-demo@example.com' AND NOT EXISTS (SELECT 1 FROM alert_rules a WHERE a.user_id = u.id AND a.rule_type = 'concentration');
