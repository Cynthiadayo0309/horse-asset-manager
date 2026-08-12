# Horse Asset Manager

一口馬主の出資検討から毎月の支出・入金、予算、回収率、引退・精算まで、お金の流れを管理するWebサービスです。

要件定義、構成図、DB/API/UI設計、セキュリティ、テスト、運用、トレーサビリティは [docs/README.md](docs/README.md) から参照できます。

競馬予想アプリではありません。レース・馬券予想、血統評価、調教分析、推奨出資馬判定、獲得賞金予測は扱いません。

## 実装済みの内容

- メール・パスワード認証と14日間のHttpOnly Cookieセッション
- 初期予算、クラブ、カテゴリーの設定
- 候補馬、出資条件、出資確定時の初回支出
- 確定した支出・入金と馬別台帳
- 馬代回収率、総合回収率、差引損益
- 定期ルール、12か月先までの支払い予定、予定と実績の照合
- 年間・月間予算、出資可能額、出資シミュレーション
- 馬別・クラブ別・カテゴリー別・月別分析
- 引退精算、アプリ内アラート、CSV出力
- シルク・ロードの文字選択可能なPDF請求書／精算書のブラウザ内取込
- 馬名編集と以前の名前の保持（PDFの馬名照合にも利用）
- 馬ステータスの自由変更と、360px以上のスマートフォン・タブレット・PC対応
- 日次Cron（UTC 0:15＝日本時間9:15）による予定補充とアラート判定
- 利用者単位のデータ分離、監査ログ、業務データのアーカイブ（馬の明示的な完全削除を除く）
- 精算完了の状態条件・利用者単位冪等性キー・D1 batchによる二重計上防止
- 照合候補・差額・理由の比較と、収支を残した照合解除
- `ALLOW_REGISTRATION` による初期アカウント作成後の登録停止
- 日時付きD1 SQLバックアップと、新しいローカルD1への復元確認

実績金額の集計元は `cashflows` だけです。予定金額や出資契約額を重ねて集計しない設計になっています。

馬の「削除」は例外的な完全削除です。確認ダイアログで馬名を完全一致入力すると、関連する出資・確定収支・予定・照合・精算も削除され、復元できません。匿名の削除監査には利用者、削除日時、テーブル別件数だけを残し、馬名・馬ID・金額は保存しません。

馬のステータスは整理用のラベルとして、現在状態に関係なく自由に変更できます。ステータス変更だけでは、出資・収支・予定・精算データは自動作成・変更されません。

収支管理の「PDFを取り込む」から、対応PDFを「支払い予定」または「支払済み」へ一括登録できます。PDFの解析とSHA-256計算はブラウザ内だけで行い、PDF本体、氏名、住所、口座情報、抽出全文はWorkerやD1へ送信・保存しません。初回対応は、今回確認したシルクとロードの文字選択可能な帳票形式だけです。画像PDF、暗号化PDF、OCR、レイアウトが異なる帳票には対応していません。

## 使用技術

- Web: React、TypeScript、Vite、React Router、TanStack Query、React Hook Form
- UI: Tailwind CSS、shadcn/ui、Recharts
- API: Cloudflare Workers、Hono、Zod
- DB: Cloudflare D1、Drizzle ORM
- Test: Vitest、Playwright（Chromium / Chrome / Edge）
- Repository: npm workspacesによるmonorepo

TypeScriptは全workspaceで `strict` を有効にしています。金額は円単位の整数、日付は `YYYY-MM-DD`、対象年月は `YYYY-MM` で扱います。

## 必要なもの

- Windows 10 / 11
- Node.js 22以上
- npm 10以上
- Google Chrome / Microsoft Edge

PowerShellでは環境によって `npm` がブロックされるため、以下では `npm.cmd` を使用します。

## 初回セットアップ

リポジトリ直下で実行します。

```powershell
npm.cmd install
npm.cmd run db:migrate:local
```

サンプルデータも使う場合だけ、次を実行します。

```powershell
npm.cmd run db:seed:local
```

ローカルデモのログイン情報は次のとおりです。

- メール: `local-demo@example.com`
- パスワード: `local-demo-password`

サンプル投入SQLはローカル専用です。remote D1には適用しないでください。

## ローカル起動

開発中はWebとAPIを同時起動します。

```powershell
npm.cmd run dev
```

ブラウザで <http://127.0.0.1:5173> を開きます。Viteが `/api/*` を `http://127.0.0.1:8787` のWorkerへ転送します。

Cloudflareと同じ「単一WorkerからAPIとSPAを配信する」形を確認する場合は、次を使います。

```powershell
npm.cmd run dev:worker
```

この場合は <http://127.0.0.1:8787> を開きます。`/api/*` はWorkerを先に実行し、それ以外はSPAへフォールバックします。

停止はターミナルで `Ctrl + C` です。

## 確認コマンド

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run test:integration
npm.cmd run build
npm.cmd run test:e2e
```

Playwrightのブラウザが未導入の場合だけ、先に実行します。

```powershell
npx.cmd playwright install chromium
```

CIではChromium、WindowsローカルではChromium・Chrome・Edgeを実行します。

## Cloudflare dev環境の準備

dev環境は次の構成です。本番環境は作成しません。

- Worker: `horse-asset-manager-dev`
- D1: `horse_asset_manager_dev`（APAC）
- URL: <https://horse-asset-manager-dev.teyontt0309.workers.dev>
- Cron: `15 0 * * *`（UTC 0:15、日本時間9:15）
- Preview URL: 無効
- サンプルデータ: 未投入

初回だけWranglerへログインします。

```powershell
Set-Location apps\api
npx.cmd wrangler login
npx.cmd wrangler whoami
```

dev用D1を作り直す場合だけ、次を実行します。表示された `database_id` は `apps/api/wrangler.jsonc` の `env.dev` に設定します。通常は既存D1を使うため、この作成コマンドは再実行しません。

```powershell
Set-Location apps\api
npx.cmd wrangler d1 create horse_asset_manager_dev --location apac --update-config=false
```

リポジトリ直下からマイグレーション、dry-run、デプロイを順に実行します。devへ `db:seed:local` は実行しません。

```powershell
Set-Location ..\..
npm.cmd run db:migrate:dev --workspace @horse-asset-manager/api
npm.cmd run build

Set-Location apps\api
npx.cmd wrangler deploy --dry-run --env dev --outdir .wrangler\dry-run-dev

Set-Location ..\..
npm.cmd run deploy:dev
```

D1を確認する場合は次を実行します。環境により異なるD1内部テーブルの `_cf_KV` / `_cf_METADATA` とマイグレーション管理テーブルを除き、アプリ用テーブルが19件なら正常です。

```powershell
Set-Location apps\api
npx.cmd wrangler d1 migrations list horse_asset_manager_dev --remote --env dev
npx.cmd wrangler d1 execute horse_asset_manager_dev --remote --env dev --command "PRAGMA foreign_key_check;"
npx.cmd wrangler d1 execute horse_asset_manager_dev --remote --env dev --command "SELECT COUNT(*) AS app_tables FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('d1_migrations', '_cf_KV', '_cf_METADATA');"
```

Cloudflare Dashboardでは、`Workers & Pages` → `horse-asset-manager-dev` → `Settings` → `Domains & Routes` から `workers.dev` のCloudflare Accessを有効にし、許可するメールだけをAllowポリシーへ登録します。セッション期限は24時間にします。さらにBillingのBudget alertsで `$7` と `$10` の通知を設定します。Budget Alertは利用停止上限ではなく通知です。

devの `ALLOW_REGISTRATION` は既定で `false` です。初期アカウントがまだない場合だけ `apps/api/wrangler.jsonc` のdev値を一時的に `true` としてデプロイ・登録し、直後に `false` へ戻して再デプロイしてください。`/api/auth/config` とログイン画面の新規登録導線で無効化を確認できます。

リアルタイムログとWorkerのロールバックは次のコマンドで操作できます。ログにはパスワード、Cookie、リクエスト本文、個別の金額明細を出さない方針です。

```powershell
Set-Location apps\api
npx.cmd wrangler tail --env dev
npx.cmd wrangler rollback --env dev
```

## D1バックアップと復元確認

DB変更前と重要な一括操作前に、日時付きSQLを保存します。`.backups/` はGit管理対象外です。

```powershell
# local D1をバックアップ
powershell -ExecutionPolicy Bypass -File scripts\backup-d1.ps1 -Local

# remote dev D1をバックアップ
powershell -ExecutionPolicy Bypass -File scripts\backup-d1.ps1

# バックアップを新しい隔離local D1へ復元して外部キーを検査
powershell -ExecutionPolicy Bypass -File scripts\restore-d1-local.ps1 `
  -BackupFile .backups\d1\<バックアップファイル>.sql
```

復元確認は既存local D1を上書きしません。remote devのTime Travelは外部DBを巻き戻すため、利用停止・直前SQLバックアップ・復旧点の記録後に `docs/10_operations_and_release.md` の手順で実施します。

## ディレクトリ構成

```text
horse-asset-manager/
├─ apps/
│  ├─ web/                 React SPA
│  └─ api/                 Hono / Cloudflare Worker
├─ packages/
│  ├─ database/            Drizzle schemaとD1接続
│  ├─ shared/              集計・日付・予定生成の共通ロジック
│  └─ validation/          Web/API共通Zodスキーマ
├─ migrations/             D1マイグレーション
├─ scripts/                seed、バックアップ、復元、資料生成
├─ tests/e2e/              Playwright E2E
└─ docs/                   要件定義・設計資料
```

## 次に確認する内容

本人限定の安定運用に必要な整合性、D1統合テスト、訂正UI、登録停止、ローカル復元は実装済みです。次は運用確認を優先します。

1. Cloudflare AccessのAllowメールが本人だけで、devの `ALLOW_REGISTRATION=false` を確認する
2. 最初の実データ投入前または次回DB変更前に、remote devのSQLバックアップとD1 Time Travel訓練を行う
3. 実データ量に近い5年CSV・分析・ページングの性能を測る
4. キーボード操作、200%ズーム、空状態・失敗状態を手動確認する
5. 一般公開を決めた場合だけ、メール確認、パスワード再設定、レート制限、規約、prod分離へ進む

添付ファイル、R2、メール通知、ブラウザ通知、課金、本番デプロイは現在の対象外です。
