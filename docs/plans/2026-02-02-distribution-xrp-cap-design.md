# Distribution XRP Auto-Cap Design

**Goal:** 分配実行時に送金元の残高とリザーブを確認し、XRPの送金額が残高不足にならないように自動調整する。トークン送金は調整しない。

## Scope
- 対象: `POST /v1/cases/:caseId/distribution/execute`
- 調整対象: XRP分配のみ（token == null）
- 送金元: 相続用ウォレット（assetLock state の wallet）

## Data Sources
- `fetchXrplAccountInfo(address)` -> Balance, OwnerCount
- `fetchXrplReserve()` -> reserve_base/reserve_inc (drops)

## Algorithm
1) 分配対象アイテム（今回送る分）の txCount を算出
   - 既存のアイテムがある場合は、送信対象（QUEUED/FAILED）だけを対象
   - 新規作成時は作成対象の全アイテム
2) 送金元の残高とOwnerCountを取得
3) 必要リザーブ: reserve_base + reserve_inc * OwnerCount
4) 手数料見込み: feePerTxDrops * txCount
   - feePerTxDrops は既存ロジックと同じ 12 drops（暫定）
5) 送金可能額: balanceDrops - 必要リザーブ - 手数料見込み
6) 送金可能額 <= 0 の場合は NOT_READY でエラー
7) XRP送金合計が送金可能額を超える場合、比率で縮小
   - ratio = availableDrops / totalXrpDrops
   - 各XRPアイテムの amountDrops = floor(amountDrops * ratio)
   - 端数分は残高に残す

## Behavior Notes
- 調整は実行のたびに再計算する（残高変動に追従）
- トークン送金は調整しない
- 既存アイテムの再実行時も同じロジックを適用（残高不足を回避）

## Errors
- 残高不足: `NOT_READY` / "残高が不足しています"
- アカウント情報取得失敗: `XRPL_ACCOUNT_INFO_FAILED`

## Testing
- 送金可能額より合計XRPが大きいとき、比率で縮小される
- 送金可能額が0以下ならエラーになる
- 既存アイテムの再実行でも縮小が適用される
