# 03. データベース設計

Cloudflare D1を想定したテーブル設計です。

## 設計方針

- 金額は円単位の整数で保存する
- 収支データは原則物理削除しない
- 例外として、利用者が明示確認した馬の完全削除では、その馬に紐づく収支を含む関連データを依存順に物理削除する
- 主要テーブルには user_id を持たせる
- 予定と実績を分けて管理する
- 出資シミュレーション、予定実績照合、引退精算を専用テーブルで管理する
- 変更履歴を audit_logs に保存できるようにする

## 1. users

利用者。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | ユーザーID |
| email | text unique | メールアドレス |
| name | text | 表示名 |
| password_hash | text nullable | パスワードハッシュ。外部認証の場合はnull可 |
| role | text | user/admin |
| status | text | active/disabled |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 2. clubs

一口クラブ。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | クラブID |
| user_id | integer fk | ユーザーID |
| name | text | クラブ名 |
| short_name | text nullable | 略称 |
| description | text nullable | メモ |
| status | text | active/archived |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 3. horses

馬情報。検討馬・出資馬の両方を扱う。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | 馬ID |
| user_id | integer fk | ユーザーID |
| club_id | integer fk nullable | クラブID |
| name | text | 馬名または募集馬名 |
| name_kana | text nullable | カナ |
| gender | text nullable | 性別 |
| birth_date | text nullable | 生年月日 |
| sire | text nullable | 父 |
| dam | text nullable | 母 |
| damsire | text nullable | 母父 |
| trainer | text nullable | 厩舎 |
| recruitment_year | integer nullable | 募集年度 |
| total_price_yen | integer nullable | 募集総額 |
| total_shares | integer nullable | 総口数 |
| unit_price_yen | integer nullable | 一口価格 |
| expected_monthly_cost_yen | integer nullable | 月額維持費見込み |
| expected_insurance_yen | integer nullable | 保険料見込み |
| application_deadline | text nullable | 募集締切日 |
| status | text | considering/applied/invested/active/retired/settling/settled/rejected/skipped |
| note | text nullable | メモ |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 4. investments

出資情報。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | 出資ID |
| user_id | integer fk | ユーザーID |
| horse_id | integer fk | 馬ID |
| shares | integer | 出資口数 |
| unit_price_yen | integer | 一口価格 |
| committed_amount_yen | integer | 契約上の出資金合計 |
| joined_on | text nullable | 出資日 |
| note | text nullable | メモ |
| archived_at | text nullable | 既存互換用のアーカイブ日時。馬削除時は出資情報も完全削除する |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 3A. horse_name_aliases

馬名変更前の募集馬名・旧名。現在名は `horses.name` を正本とする。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | 履歴ID |
| user_id | integer fk | ユーザーID |
| horse_id | integer fk | 馬ID |
| name | text | 以前の名前 |
| created_at | text | 作成日時 |

`unique(user_id, horse_id, name)` とする。馬の完全削除時は履歴も依存順に削除する。

## 4A. statement_imports

ブラウザで解析した請求書・精算書の取込記録。PDF本体や抽出全文は保存しない。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | 取込ID |
| user_id | integer fk | ユーザーID |
| source_type | text | lord/silk |
| document_hash | text | PDFのSHA-256 |
| target_month | text | YYYY-MM |
| destination | text | scheduled/confirmed |
| item_count | integer | 登録明細数 |
| created_at | text | 作成日時 |

`unique(user_id, document_hash)` で同一PDFの重複取込を防止する。

## 5. categories

収支カテゴリー。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | カテゴリーID |
| user_id | integer fk | ユーザーID |
| name | text | カテゴリー名 |
| category_type | text | expense/income |
| parent_id | integer nullable | 親カテゴリーID |
| sort_order | integer | 並び順 |
| status | text | active/archived |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 6. recurring_rules

定期支出ルール。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | ルールID |
| user_id | integer fk | ユーザーID |
| horse_id | integer fk nullable | 馬ID |
| club_id | integer fk nullable | クラブID |
| category_id | integer fk | カテゴリーID |
| title | text | ルール名 |
| amount_yen | integer | 金額 |
| frequency | text | monthly/yearly/once |
| day_of_month | integer nullable | 毎月何日 |
| start_month | text | YYYY-MM |
| end_month | text nullable | YYYY-MM |
| next_run_on | text nullable | 次回生成日 |
| status | text | active/inactive/ended |
| note | text nullable | メモ |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 7. scheduled_cashflows

予定支出・予定入金。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | 予定ID |
| user_id | integer fk | ユーザーID |
| recurring_rule_id | integer fk nullable | 定期支出ルールID |
| horse_id | integer fk nullable | 馬ID |
| club_id | integer fk nullable | クラブID |
| category_id | integer fk | カテゴリーID |
| direction | text | expense/income |
| title | text | タイトル |
| amount_yen | integer | 予定金額 |
| due_on | text | 支払予定日/入金予定日 |
| target_month | text | YYYY-MM |
| status | text | planned/paid/cancelled/overdue |
| statement_import_id | integer fk nullable | PDF取込ID |
| source_line_key | text nullable | PDF内の明細識別子 |
| note | text nullable | メモ |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 8. cashflows

実績支出・実績入金。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | 収支ID |
| user_id | integer fk | ユーザーID |
| horse_id | integer fk nullable | 馬ID |
| club_id | integer fk nullable | クラブID |
| category_id | integer fk | カテゴリーID |
| direction | text | expense/income |
| title | text | タイトル |
| amount_yen | integer | 実績金額 |
| occurred_on | text | 発生日 |
| target_month | text | YYYY-MM |
| payment_method | text nullable | 支払方法 |
| status | text | confirmed/cancelled/archived |
| statement_import_id | integer fk nullable | PDF取込ID |
| source_line_key | text nullable | PDF内の明細識別子 |
| note | text nullable | メモ |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 9. cashflow_reconciliations

予定と実績の照合。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | 照合ID |
| user_id | integer fk | ユーザーID |
| scheduled_cashflow_id | integer fk | 予定ID |
| cashflow_id | integer fk nullable | 実績ID |
| match_type | text | exact/difference/missing_actual/unplanned_actual |
| difference_yen | integer | 実績 - 予定 |
| reason | text nullable | 差額理由 |
| status | text | open/resolved |
| matched_at | text nullable | 照合日時 |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 10. budgets

予算。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | 予算ID |
| user_id | integer fk | ユーザーID |
| budget_type | text | monthly/yearly |
| target_year | integer | 年 |
| target_month | integer nullable | 月 |
| amount_yen | integer | 予算額 |
| note | text nullable | メモ |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 11. simulation_scenarios

出資シミュレーション。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | シナリオID |
| user_id | integer fk | ユーザーID |
| name | text | シナリオ名 |
| description | text nullable | 説明 |
| assumed_period_months | integer | 想定期間 |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 12. simulation_items

シミュレーションに含める候補馬。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | 明細ID |
| scenario_id | integer fk | シナリオID |
| user_id | integer fk | ユーザーID |
| horse_id | integer fk nullable | 馬ID |
| title | text | 候補名 |
| shares | integer | 想定口数 |
| initial_amount_yen | integer | 初回支出 |
| monthly_amount_yen | integer | 月額負担 |
| yearly_amount_yen | integer | 年間負担 |
| note | text nullable | メモ |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 13. horse_settlements

引退・精算管理。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | 精算ID |
| user_id | integer fk | ユーザーID |
| horse_id | integer fk | 馬ID |
| settlement_type | text | final_cost/sale_proceeds/insurance/refund/other |
| amount_yen | integer | 金額 |
| settled_on | text nullable | 精算日 |
| status | text | planned/received/paid/cancelled |
| note | text nullable | メモ |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 14. alert_rules

アラート設定。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | アラートルールID |
| user_id | integer fk | ユーザーID |
| rule_type | text | due_date/deadline/budget/input_missing/concentration |
| condition_json | text | 条件JSON |
| is_enabled | integer | 0/1 |
| notify_via | text | in_app/email/browser |
| created_at | text | 作成日時 |
| updated_at | text | 更新日時 |

## 15. notifications

通知履歴。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | 通知ID |
| user_id | integer fk | ユーザーID |
| alert_rule_id | integer fk nullable | アラートルールID |
| title | text | タイトル |
| message | text | メッセージ |
| severity | text | info/warning/error |
| is_read | integer | 0/1 |
| read_at | text nullable | 既読日時 |
| created_at | text | 作成日時 |

## 16. attachments

添付ファイル。MVP後半またはPhase 2で実装。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | 添付ID |
| user_id | integer fk | ユーザーID |
| entity_type | text | horse/cashflow/settlement |
| entity_id | integer | 紐付け先ID |
| file_name | text | ファイル名 |
| file_url | text | R2上のURLまたはキー |
| mime_type | text | MIMEタイプ |
| uploaded_at | text | アップロード日時 |
| created_at | text | 作成日時 |

## 17. audit_logs

変更履歴。

| カラム | 型 | 説明 |
|---|---|---|
| id | integer pk | ログID |
| user_id | integer fk | ユーザーID |
| action | text | create/update/delete/archive |
| entity_type | text | 対象テーブル名 |
| entity_id | integer | 対象ID |
| subject_horse_id | integer nullable | 馬関連ログを削除時に追跡する内部用ID（外部キーではない） |
| changes_json | text nullable | 変更内容JSON |
| ip_address | text nullable | IP |
| created_at | text | 作成日時 |

馬の完全削除時は詳細な馬関連ログも削除し、`entity_type=horse_deletions` の匿名ログを1件残す。このログは馬名・馬ID・金額を含まず、利用者ID、削除日時、テーブル別削除件数だけを保持する。

## 主要な関係

```text
users 1 - n clubs
users 1 - n horses
clubs 1 - n horses
horses 1 - n investments
horses 1 - n horse_name_aliases
statement_imports 1 - n scheduled_cashflows
statement_imports 1 - n cashflows
horses 1 - n scheduled_cashflows
horses 1 - n cashflows
scheduled_cashflows 1 - n cashflow_reconciliations
cashflows 1 - n cashflow_reconciliations
simulation_scenarios 1 - n simulation_items
horses 1 - n horse_settlements
```
