# Codex用 段階別プロンプト集

一度にすべてを依頼すると大きくなりすぎる場合は、以下の順番でCodexに依頼してください。

---
## Prompt 1: プロジェクト雛形作成

一口馬主向け資金管理Webサービスのプロジェクト雛形を作成してください。

前提：

- Windows Web版MVP
- React + TypeScript + Vite
- Cloudflare Workers + TypeScript
- Cloudflare D1
- Drizzle ORM
- Zod
- Tailwind CSS + shadcn/ui

以下のmonorepo構成にしてください。

```text
horse-asset-manager/
├─ apps/web
├─ apps/api
├─ packages/database
├─ packages/shared
├─ packages/validation
├─ migrations
├─ docs
└─ tests
```

TypeScript strict、ESLint、Prettier、Tailwindの基本設定も入れてください。
READMEにローカル起動手順を書いてください。

---

## Prompt 2: DBスキーマ作成

Cloudflare D1 + Drizzle ORMを前提に、以下のテーブル定義とマイグレーションSQLを作成してください。

- users
- clubs
- horses
- investments
- categories
- recurring_rules
- scheduled_cashflows
- cashflows
- cashflow_reconciliations
- budgets
- simulation_scenarios
- simulation_items
- horse_settlements
- alert_rules
- notifications
- audit_logs

設計ルール：

- 金額は円単位の整数
- 主要テーブルにはuser_idを持たせる
- 収支データは物理削除しない
- 予定と実績を分ける
- 予定支出生成の重複を防げる制約を検討する

---

## Prompt 3: API実装

Cloudflare WorkersでREST APIを実装してください。

まず以下を実装してください。

- GET/POST/PATCH clubs
- GET/POST/PATCH horses
- GET/POST/PATCH investments
- GET/POST/PATCH cashflows
- GET/POST/PATCH budgets
- GET dashboard summary
- GET horse ledger
- POST simulation calculation

要件：

- Zodで入力検証
- 一覧APIはページング対応
- user_idによるデータ分離を前提にする
- 金額は円単位整数
- エラーレスポンス形式を統一する

---

## Prompt 4: UI実装

React + TypeScript + Tailwind CSS + shadcn/uiで、Windows PC向けのUIを実装してください。

画面構成：

- 左サイドバー
- メインコンテンツ
- カード
- テーブル
- フォーム

実装画面：

- ダッシュボード
- 出資検討一覧
- 出資馬一覧
- 馬詳細
- 収支一覧
- 収支登録
- 予算・資金計画
- 出資シミュレーション
- 分析
- 設定

まずはAPIが未完成でも動作確認できるように、モックデータを使って構いません。

---

## Prompt 5: 予定支出・照合実装

以下の機能を実装してください。

- 定期支出ルール登録
- 定期支出ルールから予定支出を生成
- 同じ月に同じ予定支出を二重生成しない
- 実績支出と予定支出を紐付ける
- 予定額と実績額の差額を表示する
- 差額理由を保存する

特に、生成処理は冪等にしてください。

---

## Prompt 6: 集計・回収率実装

以下の集計ロジックを実装してください。

- 馬別支出合計
- 馬別入金合計
- クラブ別支出合計
- クラブ別入金合計
- 月別収支
- 年別収支
- 馬代回収率
- 総合回収率
- 差引損益

計算式：

```text
差引損益 = 入金総額 - 支出総額
馬代回収率 = 入金総額 / 出資金 * 100
総合回収率 = 入金総額 / 総支出 * 100
```

0除算に注意してください。

---

## Prompt 7: Cloudflareデプロイ準備

Cloudflare Workers Paid Plan前提で、dev環境にデプロイできるようにしてください。

やること：

- wrangler設定
- D1 binding設定
- dev/prod環境の分離案
- デプロイ手順README
- マイグレーション実行手順
- Cloudflare Budget Alert設定の注意書き

コスト配慮として、一覧APIのページング、予定支出生成の重複防止、CSV出力の期間指定必須も確認してください。

---
