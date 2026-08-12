# 11. 要件トレーサビリティ

## 1. 目的

要件がどの画面、API、DB、テストで実現・確認されるかを追跡します。空欄や「予定」のままのP0要件がある場合、本番公開できません。

## 2. 機能要件対応表

| 要件ID | UI | API / ロジック | DB | 主なテスト・証跡 | 状態 |
|---|---|---|---|---|---|
| FR-AUTH-001〜003 | `/login`, 許可時だけ`/register`, 保護レイアウト | `/auth/config`, `/register`, `/login`, `/logout`, `/me`; `requireAuth` | `users`, `sessions`, `audit_logs` | password tests、登録設定API、E2E登録・分離 | 実装済み |
| FR-SETUP-001〜002 | `/setup`, ルートガード | `POST /setup`, `GET /setup/defaults` | `users`, `budgets`, `clubs`, `categories`, `alert_rules` | E2E初期設定、Zod tests | 実装済み |
| FR-MST-001 | `/settings/clubs` | `/clubs` GET/POST/PATCH/DELETE | `clubs`, `audit_logs` | API所有権追加予定、UI受入 | 実装済み |
| FR-MST-002〜003 | `/settings/categories` | `/categories` GET/POST/PATCH/DELETE、defaults | `categories`, `audit_logs` | Zod tests、方向不一致統合予定 | 実装済み |
| FR-HORSE-001〜003 | `/prospects`, `/horses`, `/horses/:id` | `/horses` CRUD | `horses`, `clubs`, `audit_logs` | horse shared tests、E2E候補・出資 | 実装済み |
| FR-HORSE-004 | 馬詳細の名前編集・旧名表示 | `PATCH /horses/:id` | `horses`, `horse_name_aliases` | alias API/DB統合予定、PDF parser tests | 実装済み |
| FR-HORSE-005 | 削除確認ダイアログ | `DELETE /horses/:id` | 馬関連11テーブル、匿名`audit_logs` | E2E候補馬・出資馬完全削除 | 実装済み |
| FR-INV-001〜002 | 馬詳細の出資登録 | `/investments` GET/POST/PATCH | `investments`, `cashflows`, `audit_logs` | Zod総額、E2E出資、D1失敗注入 | 実装済み |
| FR-CF-001〜004 | `/cashflows`, `/cashflows/new` | `/cashflows` CRUD | `cashflows`, `cashflow_reconciliations`, `audit_logs` | finance tests、E2E収支、D1所有権・集計統合 | 実装済み |
| FR-SCH-001〜003 | `/scheduled`, `/calendar` | `/recurring-rules`, `/scheduled-cashflows`, schedule service | `recurring_rules`, `scheduled_cashflows` | schedule tests、E2E冪等性 | 実装済み |
| FR-REC-001〜002 | `/reconciliations` | `/reconciliations` GET/POST/PATCH/DELETE, `/auto-match` | `cashflow_reconciliations`, `scheduled_cashflows` | D1差額・解除復帰・所有権、E2E手動照合/解除 | 実装済み |
| FR-BUD-001〜002 | `/budgets`, dashboard | `/budgets`, `/available-investment` | `budgets`, `cashflows`, `scheduled_cashflows` | finance tests、Zod tests | 実装済み |
| FR-SIM-001〜003 | `/simulations`, `/:id` | `/simulations` CRUD/items/result | `simulation_scenarios`, `simulation_items` | finance simulation tests、API所有権予定 | 実装済み |
| FR-ANA-001 | `/dashboard` | `/dashboard/summary` | `cashflows`, `scheduled_cashflows`, `budgets`, `notifications` | D1固定金額縦断テスト | 実装済み |
| FR-ANA-002〜003 | `/analytics`, 馬詳細/ledger | `/analytics/*`, `/horses/:id/ledger` | `cashflows`, `investments`, masters | finance tests、D1固定金額縦断 | 実装済み |
| FR-ANA-004 | `/settings/export` | `/export/*.csv` | 集計対象各表 | D1集計一致、BOM・式注入試験 | 実装済み |
| FR-SET-001 | 馬詳細/settlements | GET/POST `/horses/:id/settlements` | `horse_settlements` | API/DB統合予定 | 実装済み |
| FR-SET-002 | 精算完了操作 | `POST /settlements/:id/complete` | `horse_settlements`, `cashflows.idempotency_key`, `audit_logs` | D1連続・同時再実行、失敗注入、E2E表示 | 実装済み |
| FR-SET-003 | 精算完了操作 | `POST /horses/:id/mark-settled` | `horses`, `horse_settlements`, `audit_logs` | pending/状態/API所有権予定 | 実装済み |
| FR-ALT-001〜003 | `/settings/alerts`, `/notifications` | `/alert-rules`, `/notifications`, alert service | `alert_rules`, `notifications` | 境界日・閾値・dedupe追加予定 | 実装済み |
| FR-PDF-001〜005 | `/cashflows/import` | browser parser、`/statement-imports` | `statement_imports`, `cashflows`, `scheduled_cashflows`, aliases | parser tests、Network/DB/E2E追加予定 | 実装済み |

## 3. 非機能要件対応表

| 要件ID | 設計・実装 | 検証 | 残対応 |
|---|---|---|---|
| NFR-SEC-001 | 全主要表`user_id`、所有権helper、404 | 隔離D1の主要API所有権マトリクス | 新規API追加時に更新 |
| NFR-SEC-002 | PBKDF2、token SHA-256、HttpOnly Cookie | password tests、構造確認 | 外部監査、強度再評価 |
| NFR-SEC-003 | Secure/Lax、Origin、secureHeaders、Access | HTTPS dev手動確認 | CSP、rate limit、CSRF最終化 |
| NFR-PRV-001 | PDF.js端末内解析、APIにファイル項目なし | parser tests | Network・D1・ログ回帰E2E |
| NFR-DAT-001 | Zod安全整数、DB check、shared計算 | validation/finance tests | DB境界統合テスト |
| NFR-REL-001 | schedule/import/notification/settlement unique | D1再実行・並行テスト | 新規金額操作へ展開 |
| NFR-REL-002 | D1 batch | 出資、PDF、定期予定、精算の失敗注入 | 馬完全削除の失敗注入は継続 |
| NFR-PERF-001 | pagination max100 | Zod tests | 10,000件性能試験 |
| NFR-PERF-002 | analytics期間、CSV最大5年 | validation | 実データ量試験 |
| NFR-USA-001 | responsive shell、Playwright設定 | Chromium E2E | Windows Chrome/Edge最終受入 |
| NFR-USA-002 | 日本語ラベル、状態表示 | UIレビュー | 初心者ユーザビリティ確認 |
| NFR-OPS-001 | audit_logs、匿名削除監査 | E2E削除 | 網羅性・保持期間確認 |
| NFR-OPS-002 | requestId・durationMs・errorTypeだけのログ | コード、tail手順 | 実環境ログ監査、通知 |
| NFR-COST-001 | ページング、期間、日次Cron、上限 | D1メトリクス | ベースラインと警戒値 |
| NFR-MNT-001 | strict、workspace、Zod、ESLint | typecheck/lint/test | CIで必須化 |

## 4. 業務ルール対応表

| ルール | 正本ロジック | 主な利用先 | 検証 |
|---|---|---|---|
| BR-01 円整数 | `yenAmountSchema`, DB integer/check, `formatYen` | 全金額 | validation/money tests |
| BR-02 実績正本 | status=confirmedを条件とするSQL | dashboard, analytics, ledger, CSV | D1固定金額縦断テスト |
| BR-03 回収率 | `calculateRecoverySummary` | 馬台帳、analytics | finance tests |
| BR-04 出資可能額 | `calculateBudgetSummary` | budgets, simulation, dashboard | finance tests |
| BR-05 状態ラベル | horse PATCH、UI | 馬一覧・詳細 | horse tests、UI受入 |
| BR-06 馬名履歴 | horse PATCH、alias照合 | 馬詳細、PDF | DB/API統合予定 |
| BR-07 完全削除 | horse DELETE batch | 馬UI | E2E完全削除 |
| BR-08 PDF最小化 | browser parser、import payload | PDF取込 | Network/DB回帰予定 |

## 5. 受入シナリオ対応

| 受入 | 自動化 | 現状 |
|---|---|---|
| AC-01 初回利用 | `tests/e2e/mvp-flow.spec.ts` | 自動化済み |
| AC-02 月次管理 | 予定冪等性、手動照合・解除E2E + D1 | 自動化済み |
| AC-03 PDF取込 | parser単体 | ブラウザ・Network E2E追加予定 |
| AC-04 利用者分離 | 2利用者の主要API D1マトリクス | 自動化済み |
| AC-05 完全削除 | 候補馬・出資馬E2E | 自動化済み |
| AC-06 引退精算 | D1連続・同時・失敗注入 + E2E表示 | 自動化済み |

## 6. 更新ルール

- 新規要件はUI/API/DB/テストの少なくとも1つと結び付ける。
- 実装済みへ変更するには、正常系だけでなく権限・境界・再実行の確認先を記載する。
- P0/P1要件に「予定」「未自動化」が残る場合、`07_implementation_plan.md` のリリースゲートへ反映する。
- コード上の挙動が要件と異なる場合、資料で隠さず状態を「一部実装」へ戻す。
