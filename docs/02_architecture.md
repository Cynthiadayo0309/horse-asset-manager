# 02. 技術構成

## 基本方針

MVPはWindows Web版として実装する。

```text
Windows PC
  └─ Chrome / Edge
       └─ React Web App
            └─ Cloudflare Workers API
                 ├─ Cloudflare D1
                 └─ Cloudflare R2（Phase 2以降）
```

## 技術スタック

| 領域 | 技術 |
|---|---|
| フロントエンド | React + TypeScript + Vite |
| UI | Tailwind CSS + shadcn/ui |
| API | Cloudflare Workers + TypeScript |
| DB | Cloudflare D1 |
| ORM | Drizzle ORM |
| バリデーション | Zod |
| テスト | Vitest / Playwright |
| ファイル保存 | Cloudflare R2 |
| デプロイ | Cloudflare Workers / Pages or Static Assets |

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

## 各ディレクトリの役割

### apps/web

React画面を配置する。

主な責務：

- 画面表示
- フォーム入力
- API呼び出し
- グラフ表示
- CSVダウンロード

### apps/api

Cloudflare Workers APIを配置する。

主な責務：

- REST API
- 認証チェック
- D1アクセス
- 集計処理
- 予定支出生成
- CSV生成

### packages/database

Drizzle ORMのテーブル定義、DB接続、クエリ補助関数を配置する。

### packages/shared

フロントエンド・APIの両方で使用する共通ロジックを配置する。

例：

- 金額フォーマット
- 回収率計算
- 予算計算
- 日付処理

### packages/validation

Zodスキーマを配置する。

例：

- 馬登録フォーム
- 収支登録フォーム
- 予算設定フォーム
- シミュレーション入力

## Cloudflare方針

Cloudflare Workers Paid Plan（月額5ドル）を前提にする。

これにより、無料枠よりも余裕を持ってAPI・定期処理・D1連携を試せる。

ただし、従量課金は発生し得るため、以下を意識する。

- 大量ループを避ける
- 全件取得を避ける
- ページングを入れる
- DB書き込みを必要最小限にする
- 定期処理は冪等にする
- 予定支出の重複生成を防止する
- CloudflareのBudget Alertを設定する

## 認証方針

MVPでは簡易認証から始めてもよい。

ただし、将来的に外部認証に差し替えられるように、以下を守る。

- usersテーブルを中心にする
- すべての主要データにuser_idを持たせる
- APIではuser_idによるデータ分離を徹底する

## 金額の扱い

- 金額はすべて円単位の整数で保持する
- 小数は使わない
- DBカラム名は amount_yen または amount とする
- 表示時に `¥12,345` のようにフォーマットする

## 日付の扱い

- 表示は日本時間を前提にする
- DBでは日付は `YYYY-MM-DD` 文字列、日時はISO形式を基本とする
- 対象年月は `YYYY-MM` 形式にする
