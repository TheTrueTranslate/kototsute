# 資産/相続人ウォレット検証の共通化 (自動検証 UI)

## 目的
- 資産と相続人の検証フローを共通化し、UI/ロジックの重複を削減する。
- ユーザー入力はシークレットのみとし、Destination/Memo/Amount は自動発行・固定値で表示する。
- Tx Hash 入力・手動検証の操作を廃止する。

## 前提
- 検証用のDestinationはシステムの検証用アドレス (XRPL_VERIFY_ADDRESS)。
- 送金額は 1 drops (= 0.000001 XRP) で固定。
- 既存API:
  - 資産: POST /v1/cases/:caseId/assets/:assetId/verify/challenge
  - 資産: POST /v1/cases/:caseId/assets/:assetId/verify/confirm
  - 相続人: POST /v1/cases/:caseId/heir-wallets/:heirWalletId/verify/challenge
  - 相続人: POST /v1/cases/:caseId/heir-wallets/:heirWalletId/verify/confirm
- secret はフロントエンドでのみ使用し、保存しない。

## 変更概要
### 共通ロジック
- `autoVerifyWalletOwnership` を新設し、以下を自動実行する:
  1) createPaymentTx
  2) signSingle
  3) submitSignedBlob
  4) confirmVerify (資産/相続人は呼び出し側で注入)
- エラーは例外で返し、UI側で通知する。

### 共通UI
- `WalletVerifyPanel` を新設して資産/相続人で共用。
- 表示項目:
  - Destination: 「Destination（運営確認用ウォレット）」
  - 説明: 「送金先はシステムの検証用アドレスです。」
  - 説明: 「1 drops (=0.000001 XRP) を送信します。」
  - Memo: 読み取り専用
- 入力: シークレットのみ (password)
- ボタン: 「シークレットで自動検証」
- TX Hash 入力、Destination/Memo のコピーボタンは削除。

### 画面改修
- CaseDetailPage の資産/相続人検証UIを `WalletVerifyPanel` に置換。
- challenge は従来通りダイアログ/セクション表示時に自動発行。
- 送金・検証中は入力/ボタン無効化＋Loading 表示。

## データフロー
- Challenge取得 → UIに Destination/Memo を表示 → Secret入力 → 自動送金 → confirmVerify
- Destination/Memo は challenge 由来の値のみを使用。

## エラーハンドリング
- challenge未発行、secret未入力、送金失敗、検証失敗はそれぞれユーザー向けに通知。
- 検証中は二重送信を防止。

## テスト
- `wallet-verify.test.ts` で共通ロジックの呼び出し順・例外伝播を検証。
- `WalletVerifyPanel.test.tsx` でUI部品の表示・入力・ボタン動作を検証。
- `CaseDetailPage.test.ts` で資産/相続人の両方が共通UIに置き換わり、
  - Destination 表記と説明文が表示される
  - Tx Hash 入力やコピーが表示されない
 ことを確認。

## 非対応
- サーバー側でsecretを受け取って検証する実装は行わない。
