# 資産ロックウィザード設計

## 目的
ケース内の全資産を「分配用Wallet（MultiSign）」へ移行し、送金検証まで完了してケースをロック状態にする。A/B方式を選択可能にし、Bをデフォルトとする。

## 前提・制約
- 実行者はケースオーナーのみ。
- 対象はケース内の全資産（XRP + Token）。
- 送金検証は資産/トークンごとにTXハッシュ入力（A方式）または自動実行（B方式）。
- 分配用Walletは新規生成。seedは暗号化してFirestoreに保存。
- B方式はRegularKey一時付与（ユーザー署名1回）を前提にサーバ側で送金・解除を実行。
- 送金不足・不一致は「失敗 → 再送金案内」。

## UI/UX（ウィザード）
URL: `/cases/:caseId/asset-lock`
入口: ケース詳細（概要タブ相当）に「資産をロックする」ボタン。

### ステップ構成
1) **準備・注意**
- 事前条件（資産の所有確認、相続人ウォレット状況、XRPL同期）を表示。
- 準備金と留保設定を差し引いた「相続予定数」を資産/トークン単位で提示。

2) **方式選択（A/B）**
- **B（デフォルト）**: 署名1回で自動送金。
- **A**: 手動送金（TXハッシュ入力が必須）。
- A選択時は手動手順の注意を明示。

3) **送金実行/入力**
- **B**: RegularKeySet署名用TXの提示 → 進捗表示（XRP/Tokenごと）。
- **A**: 分配用Walletアドレスと必要送金額（XRP/Token）を一覧提示。各行にTX入力。

4) **送金検証**
- TXごとに検証結果（OK/不足/不一致）を表示。
- 全件OKでケースをLOCKEDへ。

## データモデル（Firestore案）
- `cases/{caseId}/assetLock`
  - `status`: DRAFT | READY | LOCKING | LOCKED | FAILED
  - `method`: A | B
  - `distributionWallet`: { address, seedEncrypted, createdAt }
  - `regularKey`: { publicKey, seedEncrypted, txHash, status }
  - `createdAt`, `updatedAt`
- `cases/{caseId}/assetLockItems/{itemId}`
  - `assetId`, `assetLabel`, `assetAddress`
  - `token`: { currency, issuer, isNative } | null
  - `plannedAmount` (string)
  - `status`: PENDING | SENT | VERIFIED | FAILED
  - `txHash`, `verifiedAt`, `error`

## API（案）
- `GET /v1/cases/:caseId/asset-lock`
  - ロック状態、分配用Wallet、items一覧を返す。
- `POST /v1/cases/:caseId/asset-lock/start`
  - 分配用Wallet生成、items作成。
  - B方式の場合はRegularKey署名用TX情報を返す。
- `POST /v1/cases/:caseId/asset-lock/verify`
  - A方式のTX検証（item単位）。
- `POST /v1/cases/:caseId/asset-lock/execute`
  - B方式の自動送金実行と検証。

## 検証ロジック
- 既存 `fetchXrplTx` を利用。
- 送金先 = 分配用Walletアドレス。
- 金額一致チェック（XRP/Token）。
- 不足/不一致は item を FAILED にし、再送金案内。
- 全 item が VERIFIED で `cases.assetLockStatus = LOCKED` に更新。

## 鍵管理・暗号化
- AES-256-GCMを使用。
- `ASSET_LOCK_ENCRYPTION_KEY`（32byte base64）をfunctions環境変数に追加。
- 保存形式: `{ cipherText, iv, tag, version }`。
- seedはUIに返さない。

## エラーハンドリング
- 資産未同期・検証未完了などはウィザード先頭で警告表示。
- TX未検出・送金不足は item 単位で失敗表示。
- B方式の署名・送金失敗は `assetLock.status = FAILED`。

## テスト方針
- functions: asset-lock APIのE2Eテスト追加（正常/不足/不一致/権限）。
- web: ウィザードUIの表示・状態遷移テスト。

