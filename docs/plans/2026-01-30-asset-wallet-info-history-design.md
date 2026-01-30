# 資産詳細: ウォレット情報キャッシュ・履歴統合・相続予定数 表示

**目的**
- XRPLのウォレット情報をキャッシュして表示する（期限なし）
- 留保数量を単位付きで表示し、相続予定数を算出表示する
- 資産詳細にタブを導入し、履歴タブで「同期ログ + 資産履歴」を時系列統合表示する

---

## データモデル

### asset ドキュメント (`cases/{caseId}/assets/{assetId}`)
- 既存: `label`, `address`, `verificationStatus`, `reserveXrp`, `reserveTokens` ...
- 追加:
  - `xrplSummary`:
    - `status`: "ok" | "error"
    - `balanceXrp`: string
    - `ledgerIndex`: number | null
    - `tokens`: Array<{ currency: string; issuer: string | null; balance: string }>
    - `syncedAt`: Date

### 資産履歴コレクション
- `cases/{caseId}/assets/{assetId}/history`
- plan history と同構造を踏襲:
  - `historyId`, `type`, `title`, `detail`, `actorUid`, `actorEmail`, `createdAt`, `meta`

### 同期ログ
- 既存 `syncLogs` は維持（移行なし）
- 表示時に `history` と `syncLogs` を統合して履歴一覧化

---

## API 仕様

### GET /v1/cases/:caseId/assets/:assetId
- `xrplSummary` を含めて返却（キャッシュ）
- `includeXrpl=true` の場合:
  - XRPLから取得 → `xrplSummary` 更新 → 返却

### GET /v1/cases/:caseId/assets/:assetId/history
- `history` と `syncLogs` を統合して返却
- `createdAt` 降順
- 最大50件

### 記録対象（資産履歴）
- 資産登録 / 削除
- 留保変更
- XRPL同期（`xrplSummary` 更新）
- 検証開始 / 完了

---

## UI/UX

### タブ構成
- 「概要」 / 「履歴」

### 概要タブ
- 基本情報
- **ウォレット情報（旧XRPLサマリー）**
  - キャッシュ値を表示
  - 最終同期時刻を表示
- 留保設定
  - XRP 留保入力に「XRP」単位表記を追加
- **相続予定数**
  - XRP: `balanceXrp - reserveXrp`（負なら0）
  - Token: `token.balance - reserveAmount`（負なら0）
  - キャッシュ未取得時は未表示/案内

### 履歴タブ
- 同期ログ + 資産履歴を時系列で統合
- 種別バッジを表示
- 最大50件

---

## 計算ルール

- XRPは「XRP」単位（dropsではない）
- Tokenは `currency + issuer` で一致判定
- 留保未設定は 0 と扱う
- 相続予定数は表示用（ロック時は別計算）

---

## テスト方針

- functions: history統合API、xrplSummary保存
- web: タブ切替、単位表示、相続予定数の表示

