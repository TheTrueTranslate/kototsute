# ことづて (Kototsute)

## サービス概要
「ことづて」は、相続時の手続きで発生しやすい「最新版はどれか」「申請や受領が本当に行われたか」を、改ざん耐性のある形で証明するためのサービスです。  
個人情報や書類本体はオフチェーンで扱い、XRPL には主に検証可能な最小情報（取引ハッシュ、検証トランザクション、状態遷移に必要なメタ情報）を扱う設計です。

### 主要な利用者（4ロール）
- 被相続者: 生前の指図（プラン）を作成・更新する
- 相続者: 死亡後にケース進行、書類提出、承認フローに参加する
- 金融機関担当: ケースの受付・進行・完了を処理する
- 管理者: 死亡申請審査、権限管理、監査対応を行う

### MVP の中核機能
- ケース作成とメンバー（相続者）招待
- 資産登録とウォレット所有確認
- 死亡申請（Death Claim）提出と管理者審査
- Asset Lock 用ウォレット生成と残高/保有資産の確認
- SignerList 構築とマルチシグ承認
- XRP / 発行トークン / NFT の分配実行
- 通知・履歴・監査向けステータス可視化

### プロダクトフロー（要約）
1. 被相続者がケースを作成し、資産・プラン・相続者を設定する
2. 相続者がウォレットを検証し、死亡申請を提出する
3. 管理者が死亡申請を審査し、承認後に実行フローへ進む
4. Asset Lock と SignerList 準備後、必要署名を集めて分配を実行する
5. ケースの進捗・結果を API と UI で追跡する

## Technical Documentation ✅

### 技術スタック
- Monorepo: pnpm workspace
- Frontend: React + Vite + TypeScript（`apps/web`, `apps/admin`）
- Backend: Firebase Functions v2 + Hono + TypeScript（`apps/functions`）
- DB / Storage / Auth: Firestore / Firebase Storage / Firebase Auth
- Blockchain: XRPL（主に Testnet 設定）
- Test: Vitest

### リポジトリ構成
```txt
apps/
  web/            # ユーザー向けUI
  admin/          # 管理者向けUI
  functions/      # API (Firebase Functions + Hono)

packages/
  shared/         # 共通ユーティリティ・XRPL ラッパー・i18n
  asset/          # 資産ドメイン
  case/           # ケースドメイン
  plan/           # プランドメイン
  death-attestation/
  credential/
  audit/
  internal/       # CLI ツール（XRPL操作など）
  ui/
```

### アーキテクチャ方針
- `apps/*` は薄い層（UI / API エントリ）に寄せる
- ドメインロジックは `packages/*` に集約する
- `packages/shared` に共通 Value / Validation / XRPL 実装を配置する
- Functions は認証・バリデーション・ユースケース呼び出しと I/O 調停に集中する

### API 構成（`/v1`）
- `/assets`: 資産 CRUD・所有者向け参照
- `/cases`: ケース進行全般（招待、死亡申請、資産ロック、分配、署名）
- `/plans`: プラン作成・更新・配分設定
- `/invites`: 招待管理
- `/notifications`: 通知取得・既読化
- `/admin`: 管理者向け死亡申請確認・ファイルダウンロード

### ローカル開発
前提:
- Node.js 20 系（`apps/functions` の engines 指定に合わせる）
- pnpm
- go-task（`task` コマンド）
- Firebase CLI

セットアップ:
```bash
pnpm install
cp apps/web/.env.example apps/web/.env
cp apps/admin/.env.example apps/admin/.env
cp apps/functions/.env.example apps/functions/.env
```

開発起動:
```bash
task dev
```

主要コマンド:
```bash
# 全体ビルド（shared/case/functions/web）
task build

# Functions ビルド（Functions修正時は必須）
task functions:build

# テスト
pnpm -C apps/functions test
pnpm -C apps/web test
pnpm -C packages/shared test
```

### セキュリティ運用メモ
- シードや秘密情報は `.env` で管理し、Git に含めない
- 認証は Firebase ID Token を使用し、Functions で検証する
- Firestore / Storage ルールとサーバ側権限チェックを併用する

## XRPL Features Used ✅

### ネットワーク設定
- 既定は XRPL Testnet
  - JSON-RPC: `https://s.altnet.rippletest.net:51234`
  - WebSocket: `wss://s.altnet.rippletest.net:51233`
- Functions / Web ともに環境変数で接続先を切り替え可能

### 使用している主なトランザクション
| 種別 | 用途 | 主な実装箇所 |
| --- | --- | --- |
| `Payment` (XRP) | ウォレット検証、事前送金、分配送金 | `packages/shared/src/xrpl/xrpl-wallet.ts`, `apps/functions/src/api/routes/cases.ts` |
| `Payment` (Issued Token) | 発行トークン分配 | `packages/shared/src/xrpl/xrpl-wallet.ts` |
| `SignerListSet` | 分配ウォレットの署名者リスト設定 | `packages/shared/src/xrpl/xrpl-wallet.ts`, `apps/functions/src/api/utils/inheritance-execution.ts` |
| `SetRegularKey` | 実行後の RegularKey クリア | `packages/shared/src/xrpl/xrpl-wallet.ts`, `apps/functions/src/api/routes/cases.ts` |
| `NFTokenCreateOffer` | NFT 分配時の Sell Offer 作成 | `packages/shared/src/xrpl/xrpl-wallet.ts`, `apps/functions/src/api/routes/cases.ts` |

### 使用している主な XRPL RPC コマンド
| コマンド | 用途 | 実装箇所 |
| --- | --- | --- |
| `wallet_propose` | Asset Lock 用ウォレット生成 | `apps/functions/src/api/routes/cases.ts` |
| `account_info` | 口座有効化・残高・RegularKey確認 | `apps/functions/src/api/utils/xrpl.ts` |
| `account_lines` | 保有トークン確認 | `apps/functions/src/api/utils/xrpl.ts` |
| `account_nfts` | 保有NFT確認 | `apps/functions/src/api/utils/xrpl.ts` |
| `server_state` | リザーブ値・validated ledger 参照 | `apps/functions/src/api/utils/xrpl.ts` |
| `tx` | 検証用トランザクション照合 | `apps/functions/src/api/utils/xrpl.ts` |
| `submit_multisigned` | マルチシグ提出 | `apps/functions/src/api/utils/xrpl-multisign.ts` |
| `nft_sell_offers` | NFTオファーID解決 | `packages/shared/src/xrpl/xrpl-wallet.ts` |

### 実装している XRPL フロー
- 所有確認:
  - サーバが challenge（Memo）を発行
  - クライアントが `Payment` をローカル署名して送信
  - サーバが `tx` 参照で Memo / 送信元 / 宛先を検証
- マルチシグ承認:
  - 承認対象 `Payment` を `autofill` で生成
  - 各署名者が `sign(tx, true)` で部分署名
  - サーバが署名結合後、`submit_multisigned` で送信
- 分配実行:
  - XRPL リザーブと口座状態を確認
  - XRP / Issued Token の送金と NFT の Sell Offer 作成を順次実行
  - 実行結果（tx hash）をケースに保存

### 内部ツールで利用する XRPL 機能
`task tools:xrpl` で `packages/internal` の CLI を起動し、以下を補助実行できます。
- XRP 送金
- NFT の Mint + 送信
- 発行トークンの発行 + 送信

内部ツールで利用する主なトランザクション:
| 種別 | 用途 | 主な実装箇所 |
| --- | --- | --- |
| `Payment` (XRP) | CLI からの XRP 送金 | `packages/internal/src/cli/xrpl-actions.ts`, `packages/shared/src/xrpl/xrpl-wallet.ts` |
| `TrustSet` | 発行トークン受領準備 | `packages/shared/src/xrpl/xrpl-wallet.ts` |
| `Payment` (Issued Token) | 発行トークン送信 | `packages/internal/src/cli/xrpl-actions.ts`, `packages/shared/src/xrpl/xrpl-wallet.ts` |
| `NFTokenMint` | NFT 発行 | `packages/shared/src/xrpl/xrpl-wallet.ts` |
| `NFTokenCreateOffer` | NFT 送信用オファー作成 | `packages/shared/src/xrpl/xrpl-wallet.ts` |
| `NFTokenAcceptOffer` | NFT オファー受領 | `packages/shared/src/xrpl/xrpl-wallet.ts` |
