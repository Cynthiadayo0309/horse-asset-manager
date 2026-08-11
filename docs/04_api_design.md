# 04. API設計

Cloudflare WorkersでREST APIを実装する想定です。

## 共通方針

- JSON APIとする
- URLは `/api` 配下に統一する
- 入力値はZodで検証する
- 一覧APIはページング対応する
- 金額は円単位の整数で受け渡す
- APIレスポンスには必要以上のデータを含めない

## 共通レスポンス

### 成功

```json
{
  "data": {},
  "message": "OK"
}
```

### エラー

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容を確認してください",
    "details": []
  }
}
```

## 認証

MVPでは簡易認証で開始してよい。

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

## ダッシュボード

```text
GET /api/dashboard/summary?targetMonth=2026-08
```

返却例：

```json
{
  "targetMonth": "2026-08",
  "scheduledExpenseYen": 128000,
  "actualExpenseYen": 86000,
  "incomeYen": 150000,
  "yearlyScheduledExpenseYen": 1560000,
  "alerts": []
}
```

## クラブ

```text
GET    /api/clubs
POST   /api/clubs
GET    /api/clubs/:id
PATCH  /api/clubs/:id
DELETE /api/clubs/:id
```

DELETEは物理削除ではなく、原則 `status=archived` にする。

## 馬

```text
GET    /api/horses?status=considering&page=1&pageSize=20
POST   /api/horses
GET    /api/horses/:id
PATCH  /api/horses/:id
DELETE /api/horses/:id
```

一覧・詳細は `aliases: string[]` を返す。PATCHで馬名を変更した場合は、変更前の名前を `horse_name_aliases` へ保存し、馬本体の更新・監査ログと同じD1 `batch()`で処理する。

馬のDELETEだけは物理削除禁止の例外とする。厳格なJSON `{ "confirmationName": "登録済みの馬名" }` を必須とし、完全一致しない場合は409、未知フィールドなどの不正入力は422を返す。成功時は馬に紐づく出資・収支・予定・照合・精算・シミュレーション明細・対象通知・詳細監査ログをD1 `batch()`で完全削除する。

```json
{
  "data": { "deleted": true },
  "message": "馬と関連データを完全削除しました。"
}
```

## 出資情報

```text
GET   /api/investments?horseId=1
POST  /api/investments
PATCH /api/investments/:id
```

## 出資シミュレーション

```text
GET    /api/simulations
POST   /api/simulations
GET    /api/simulations/:id
PATCH  /api/simulations/:id
DELETE /api/simulations/:id
POST   /api/simulations/:id/items
PATCH  /api/simulations/:id/items/:itemId
DELETE /api/simulations/:id/items/:itemId
GET    /api/simulations/:id/result
```

計算結果例：

```json
{
  "initialTotalYen": 320000,
  "monthlyIncreaseYen": 9000,
  "firstYearTotalYen": 428000,
  "annualBudgetYen": 600000,
  "remainingBudgetYen": 172000,
  "budgetUsageRate": 71.3,
  "isOverBudget": false
}
```

## 定期支出ルール

```text
GET    /api/recurring-rules
POST   /api/recurring-rules
GET    /api/recurring-rules/:id
PATCH  /api/recurring-rules/:id
DELETE /api/recurring-rules/:id
POST   /api/recurring-rules/generate?targetMonth=2026-08
```

予定支出生成は冪等にする。同じルール・同じ対象月で二重生成しない。

## 予定支出

```text
GET   /api/scheduled-cashflows?targetMonth=2026-08
POST  /api/scheduled-cashflows
PATCH /api/scheduled-cashflows/:id
```

## 実績収支

```text
GET    /api/cashflows?targetMonth=2026-08&page=1&pageSize=50
POST   /api/cashflows
GET    /api/cashflows/:id
PATCH  /api/cashflows/:id
DELETE /api/cashflows/:id
```

DELETEは物理削除ではなく `status=archived` を推奨する。

## PDF請求書・精算書取込

```text
GET  /api/statement-imports/check?documentHash=<SHA-256>
POST /api/statement-imports
```

GETは同じ利用者が同じPDFを登録済みか確認する。POSTは最大100明細を厳格なZodスキーマで検証し、`statement_imports`、確定収支または支払い予定、金額を含まない監査ログをD1 `batch()`で保存する。重複時は409 `STATEMENT_ALREADY_IMPORTED` を返す。PDF本体や抽出全文はAPIへ送らない。

## 予定・実績照合

```text
GET  /api/reconciliations?targetMonth=2026-08
POST /api/reconciliations
POST /api/reconciliations/auto-match?targetMonth=2026-08
PATCH /api/reconciliations/:id
```

## 予算

```text
GET   /api/budgets?year=2026
POST  /api/budgets
PATCH /api/budgets/:id
GET   /api/budgets/available-investment?year=2026
```

## 分析

```text
GET /api/analytics/by-horse?from=2026-01-01&to=2026-12-31
GET /api/analytics/by-club?from=2026-01-01&to=2026-12-31
GET /api/analytics/by-category?from=2026-01-01&to=2026-12-31
GET /api/analytics/monthly?year=2026
GET /api/analytics/recovery-rates?period=all
```

## 引退・精算

```text
GET   /api/horses/:horseId/settlements
POST  /api/horses/:horseId/settlements
PATCH /api/settlements/:id
POST  /api/horses/:horseId/mark-settled
```

## 通知

```text
GET   /api/notifications
PATCH /api/notifications/:id/read
GET   /api/alert-rules
POST  /api/alert-rules
PATCH /api/alert-rules/:id
```

## CSV出力

```text
GET /api/export/cashflows.csv?from=2026-01-01&to=2026-12-31
GET /api/export/analytics-by-horse.csv?year=2026
GET /api/export/analytics-by-club.csv?year=2026
```
