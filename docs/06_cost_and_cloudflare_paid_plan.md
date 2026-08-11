# 06. Cloudflare Workers $5プラン前提の注意点

## 結論

Cloudflare Workersを5ドルプランにしたことで、MVP開発は進めやすくなる。

特に以下の点がメリットになる。

- Workersの利用上限に余裕が出る
- 本番に近い構成でAPIを作りやすい
- D1、R2、Cronなどを含めたCloudflare中心構成を採用しやすい
- Windows Web版MVPなら、十分現実的な構成になる

ただし、5ドル固定で完全に使い放題という意味ではない。
従量課金が発生し得るため、設計段階からコストを意識する。

## 本アプリでの影響

### 変えなくてよいこと

以下は以前の設計のままでよい。

- React + TypeScript + Vite
- Cloudflare Workers API
- Cloudflare D1
- Drizzle ORM
- Zod
- Cloudflare R2はPhase 2以降
- Windows Web版MVP

### 変えた方がよいこと

以下は5ドルプラン前提として、最初から考慮する。

- Cloudflareへの早期デプロイ
- 開発環境と本番環境の分離
- Budget Alert設定
- 一覧APIのページング
- DB書き込みの重複防止
- 定期処理の冪等化
- 予定支出生成処理の安全対策

## 推奨環境

```text
local
  Windows PC上のローカル開発

dev
  Cloudflare上の検証環境

prod
  将来の本番環境
```

## wrangler環境イメージ

```toml
name = "horse-asset-manager-api"
main = "src/index.ts"
compatibility_date = "2026-08-09"

[vars]
APP_ENV = "dev"

[[d1_databases]]
binding = "DB"
database_name = "horse_asset_manager_dev"
database_id = "xxxx"
```

本番では `horse_asset_manager_prod` のようにDBを分ける。

## コストを抑えるための実装ルール

### API

- 一覧APIは必ず `page` と `pageSize` を受け取る
- `pageSize` の上限を決める。例：100件
- ダッシュボードAPIは必要な集計だけ返す
- 期間指定のない巨大集計を避ける

### DB

- 不要な `SELECT *` を避ける
- 必要なカラムだけ取得する
- `target_month`、`user_id`、`horse_id`、`club_id` などにインデックスを検討する
- 予定支出生成時はユニーク制約または事前チェックで二重登録を防ぐ

### Cron

- MVPでは毎日1回程度から始める
- 1時間未満の頻度は避ける
- 定期処理は対象月・対象ユーザーを絞る
- 処理済み状態を記録する

### R2

- MVP初期では添付ファイルを後回しにする
- PDFや画像保存を実装する場合はサイズ制限を設ける
- 例：1ファイル10MBまで

## 最初にCloudflare側で行うこと

1. Budget Alertを設定する
2. Workersプロジェクトを作成する
3. D1 dev DBを作成する
4. wranglerからローカル接続を確認する
5. dev環境へデプロイする
6. 使用量をダッシュボードで確認する

## 開発時の注意

以下のようなバグはコスト増加につながるため避ける。

- 無限ループでDBへ書き込み続ける
- Cronで同じ予定支出を毎回再生成する
- 大量データを毎回全件取得する
- 画面表示のたびに重い集計APIを連続実行する
- ファイルアップロードを無制限にする

## 本アプリにおける安全設計

### 予定支出生成の冪等性

同じ `recurring_rule_id` と `target_month` の組み合わせでは、同じ予定支出を二重生成しない。

候補制約例：

```text
unique(user_id, recurring_rule_id, target_month)
```

### CSV出力

全期間CSVは大量化する可能性があるため、期間指定を必須にする。

### 集計

ダッシュボードでは直近6か月や当年など、範囲を限定する。
