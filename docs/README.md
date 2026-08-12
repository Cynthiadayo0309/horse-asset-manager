# Horse Asset Manager 資料一覧

このディレクトリは、Horse Asset Manager の要件・設計・検証・運用に関する正本です。コードと資料に差異がある場合は、差異を課題として記録し、実装または資料を更新します。

## 文書情報

| 項目 | 内容 |
|---|---|
| 対象 | 一口馬主向け資金管理Webサービス MVP |
| 基準日 | 2026-08-12 |
| 対象実装 | 自分専用安定運用版（2026-08-12作業ツリー） |
| 対象環境 | Windows 10/11、Chrome、Edge |
| 本番状況 | Accessで本人限定するdev環境まで。一般公開prodと課金機能は対象外 |

## 読み方

| 資料 | 主な読者 | 内容 |
|---|---|---|
| [00_project_overview.md](./00_project_overview.md) | 全員 | 目的、価値、利用者、スコープ、用語 |
| [01_requirements.md](./01_requirements.md) | PO、設計、QA | 業務要件、機能要件、受入条件、対象外 |
| [02_architecture.md](./02_architecture.md) | 開発、運用 | システム構成図、データフロー、配置、設計原則 |
| [03_database_design.md](./03_database_design.md) | API、DB、QA | 19テーブル、関係、制約、削除・監査方針 |
| [04_api_design.md](./04_api_design.md) | Web、API、QA | REST API、認証、レスポンス、エラー、冪等性 |
| [05_ui_routes.md](./05_ui_routes.md) | UI、QA、PO | 画面構成、ルート、主要操作、レスポンシブ方針 |
| [06_cost_and_cloudflare_paid_plan.md](./06_cost_and_cloudflare_paid_plan.md) | 運用、開発 | Cloudflare費用前提、制限、コストガードレール |
| [07_implementation_plan.md](./07_implementation_plan.md) | PO、開発 | 実装状況、残課題、リリース判定 |
| [08_security_and_data_protection.md](./08_security_and_data_protection.md) | セキュリティ、開発 | 脅威、データ分類、実装済み対策、残課題 |
| [09_test_and_acceptance_plan.md](./09_test_and_acceptance_plan.md) | QA、開発 | テスト戦略、受入シナリオ、品質ゲート |
| [10_operations_and_release.md](./10_operations_and_release.md) | 運用、開発 | デプロイ、監視、障害対応、バックアップ、復旧 |
| [11_requirements_traceability.md](./11_requirements_traceability.md) | PO、QA、監査 | 要件とUI/API/DB/テストの対応表 |
| [12_decisions_and_open_issues.md](./12_decisions_and_open_issues.md) | 全員 | 設計判断、リスク、未決事項 |

## 状態の定義

| 状態 | 意味 |
|---|---|
| 実装済み | MVPコードに主要経路があり、少なくとも単体・API・E2Eのいずれかで確認可能 |
| 一部実装 | 主要経路はあるが、UI、例外処理、テストまたは運用手順に不足がある |
| 未実装 | 設計のみ、またはMVP対象外 |
| 要確認 | 本番公開前に利用者・運用者の判断が必要 |

## 変更管理

- 要件変更時は `01_requirements.md` の要件IDを維持し、受入条件と `11_requirements_traceability.md` を同時更新する。
- API、DB、画面ルートを変更した場合は、対応する設計書とテストを同じ変更単位で更新する。
- 金額定義、回収率、出資可能額、完全削除の範囲は業務上重要なため、暗黙に変更しない。
- Cloudflareの価格・上限は変更され得るため、公開前に公式ドキュメントを再確認する。
