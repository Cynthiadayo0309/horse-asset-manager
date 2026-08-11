# 07. 実装計画

## Phase 0: 準備

- Node.js LTSをインストール
- Git for Windowsをインストール
- VS Codeをインストール
- Cloudflareアカウント確認
- GitHubリポジトリ作成
- Cloudflare Workers Paid Plan確認
- Budget Alert設定

## Phase 1: プロジェクト雛形

- monorepo構成を作成
- React + Vite + TypeScriptを作成
- Cloudflare Workers APIを作成
- ESLint / Prettier設定
- Tailwind CSS設定
- shadcn/ui設定
- Drizzle ORM設定
- Zod設定

## Phase 2: DB設計・マイグレーション

- D1 dev DB作成
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

## Phase 3: 基本API

- 認証API
- クラブAPI
- 馬API
- 出資情報API
- カテゴリーAPI
- 予算API

## Phase 4: 収支API

- 定期支出ルールAPI
- 予定支出API
- 実績収支API
- 予定・実績照合API
- 支払カレンダーAPI

## Phase 5: 集計・シミュレーションAPI

- ダッシュボード集計
- 馬別資金台帳
- クラブ別資金台帳
- カテゴリー別集計
- 月別集計
- 回収率計算
- 出資シミュレーション
- 出資可能額計算

## Phase 6: UI実装

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

## Phase 7: アラート・CSV

- アプリ内通知
- 支払期限アラート
- 募集締切アラート
- 予算超過アラート
- CSV出力

## Phase 8: テスト・デプロイ

- 単体テスト
- APIテスト
- E2Eテスト
- Cloudflare dev環境デプロイ
- 動作確認
- README整備

## 優先度

### 最優先

- クラブ登録
- 馬登録
- 出資情報登録
- 支出・入金登録
- ダッシュボード
- 馬別資金台帳

### 次に優先

- 予定支出
- 定期支出ルール
- 予定・実績照合
- 予算管理
- 出資シミュレーション

### 後回し

- 添付ファイル
- R2連携
- PWA
- ブラウザ通知
- AI OCR
