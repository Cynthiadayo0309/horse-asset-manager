# Codex用 総合プロンプト

以下をCodexに貼り付けて、初回実装を開始してください。

---
あなたはフルスタック開発者です。
これから「一口馬主向け資金管理Webサービス」を実装してください。

## 最重要方針

このアプリは競馬予想アプリではありません。
レース予想、馬券予想、血統分析、調教分析、馬体評価、推奨出資馬判定、獲得賞金予測は実装しないでください。

中心価値は、一口馬主活動のお金の流れを管理することです。
特に、以下を重視してください。

- 出資検討時点での資金シミュレーション
- 将来の予定支出
- 月間・年間予算
- 予定支出と実績支出の照合
- 馬別資金台帳
- クラブ別資金台帳
- 引退・精算管理

## MVP対象

- Windows Web版
- Google Chrome / Microsoft Edge
- PC画面前提
- 左サイドバー＋メインコンテンツ構成

Swift、iOS、Android、App Store配布はMVP対象外です。

## 技術スタック

- Frontend: React + TypeScript + Vite
- UI: Tailwind CSS + shadcn/ui
- API: Cloudflare Workers + TypeScript
- DB: Cloudflare D1
- ORM: Drizzle ORM
- Validation: Zod
- Test: Vitest / Playwright

Cloudflare WorkersはPaid Plan（月額5ドル）を前提にします。
ただし従量課金を避けるため、一覧APIにはページングを入れ、DB書き込みの重複防止、Cron処理の冪等性を意識してください。

## 作成してほしいもの

まずは以下を実装してください。

1. Monorepo構成
2. React Webアプリ
3. Cloudflare Workers API
4. Drizzle ORMによるD1テーブル定義
5. マイグレーションSQL
6. Zodバリデーション
7. 基本画面
8. 基本API
9. サンプルデータ
10. README

## 推奨リポジトリ構成

```text
horse-asset-manager/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  └─ public/
│  └─ api/
│     └─ src/
├─ packages/
│  ├─ database/
│  ├─ shared/
│  └─ validation/
├─ migrations/
├─ docs/
├─ tests/
├─ package.json
└─ README.md
```

## 必須テーブル

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

## 必須画面

- ログイン
- 初期設定
- ダッシュボード
- 出資検討一覧
- 出資検討詳細
- 出資シミュレーション
- 出資馬一覧
- 馬詳細
- 馬別資金台帳
- 収支一覧
- 収支登録
- 予定支出一覧
- 支払カレンダー
- 予算・資金計画
- 分析
- 設定

## 最初に実装する範囲

最初の実装では、以下を動く状態にしてください。

- クラブ登録・一覧
- 馬登録・一覧・詳細
- 出資情報登録
- 収支登録
- ダッシュボード集計
- 馬別資金台帳
- 予算登録
- 出資シミュレーションの計算

UIは完成度よりも、機能の流れが分かることを優先してください。

## 実装ルール

- TypeScript strictを有効にしてください。
- anyは原則使用しないでください。
- 金額はすべて円単位の整数で扱ってください。
- 収支データは物理削除ではなくアーカイブ扱いにしてください。
- すべての主要データに user_id を持たせてください。
- API入力値はZodで検証してください。
- 一覧APIにはページングを入れてください。
- 予定支出生成は同じ月に二重作成されないようにしてください。

## 進め方

1. まずファイル構成を作成してください。
2. 次にDBスキーマとマイグレーションを作成してください。
3. APIを実装してください。
4. Web画面を実装してください。
5. サンプルデータで動作確認できるようにしてください。
6. 実行手順をREADMEに書いてください。

必要に応じて、実装前に簡単な作業計画を提示してください。

---
