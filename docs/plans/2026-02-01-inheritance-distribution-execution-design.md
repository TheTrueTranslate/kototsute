# 相続分配（実行ジョブ管理）設計

## 目的
相続実行の同意が完了した後に、相続人の受取用ウォレットへ分配を実行する。
分配はサーバー側ジョブで進捗管理し、途中再開・失敗スキップ・運営エスカレに対応する。

## 対象範囲
- 共有中の指図をすべて対象（C）
- XRP + トークン（B）
- 相続実行タブに「分配を実行」セクション追加
- 既存の「相続実行の同意」を折りたたみ表示

## 画面/UX
- 相続実行タブに「相続実行の同意（折りたたみ）」を設置
- 同意完了後に「分配を実行」セクションを表示
- 表示項目:
  - 状態: 未実行 / 実行中 / 一部失敗 / 完了 / 失敗
  - 進捗: 完了件数 / 総件数 / 失敗件数 / スキップ件数
  - エスカレ件数
- 操作:
  - 「分配を実行」: 初回作成 + 実行開始
  - 「再開」: 停止中や一部失敗の継続
  - 実行中はボタン無効・自動更新

## データ構成
### `cases/{caseId}/distribution/state`
- status: `PENDING | RUNNING | PARTIAL | COMPLETED | FAILED`
- totalCount
- successCount
- failedCount
- skippedCount
- escalationCount
- lastProcessedAt
- startedAt
- updatedAt
- error
- retryLimit

### `cases/{caseId}/distribution/items/{itemId}`
- status: `QUEUED | SENT | VERIFIED | FAILED | SKIPPED`
- planId
- planTitle
- assetId
- assetLabel
- heirUid
- heirAddress
- token: { currency, issuer, isNative } | null
- amount: string (XRP=drop, トークン=小数文字列)
- attempts
- txHash
- error
- createdAt
- updatedAt

## 実行ロジック
### 前提チェック
- ケース: `IN_PROGRESS`
- 相続実行の同意: `approvalTx` が `VALIDATED` & `tesSUCCESS`
- 相続人の受取用ウォレットが全員 `VERIFIED`
- 共有中の指図が存在
- 分配用ウォレット（assetLock/state.wallet）取得済み

### ジョブ作成（初回）
1. 共有中の指図を取得
2. 指図内の資産を取得
3. `assetLockItems` から資産ごとの総量を取得
4. `allocations` から相続人ごとの分配量を計算
5. items を作成（amount <= 0 は除外）

### 分配量計算
- unitType = `PERCENT`: 総量 × (割合/100)。端数は切り捨て、残りは未分配扱い。
- unitType = `AMOUNT`: 指定値をそのまま採用（XRPはdrops変換）。
- 指定合計が総量を超える場合はエラーで開始不可。

### 実行/再開
- `QUEUED` / 再試行可能 `FAILED` のみ処理
- 送金成功で `VERIFIED`、失敗で `FAILED`
- 失敗回数が閾値を超えたら `SKIPPED` + エスカレ
- 進捗は都度 `state` に反映

## エラー/エスカレーション
- XRPL送金失敗 → `FAILED` + attempts++
- attempts >= retryLimit → `SKIPPED` + escalationCount++
- 継続不能な事前条件不備 → 400 エラー

## API
- `GET /v1/cases/:caseId/distribution` 進捗取得
- `POST /v1/cases/:caseId/distribution/execute` 実行/再開

## テスト方針
- functions: ジョブ作成/再開、事前条件、失敗→スキップ遷移
- web: 分配セクション表示、状態ラベル/ボタン制御

## 既知の注意点
- トークンのTrustLine未設定時は送金失敗 → 再試行/スキップで吸収
- XRP手数料不足は失敗として扱い、補充後に再開
