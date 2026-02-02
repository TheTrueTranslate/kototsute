# 資産検証の自動化 (シークレット入力のみ)

## 目的
- 資産詳細のXRPL検証を「シークレット入力のみ」で完結させる。
- Destination/Memo/Amountは自動発行・固定値とし、ユーザーが入力するのはシークレットのみとする。
- 送金から検証完了までを自動で実行し、TX Hash入力は廃止する。

## 前提
- 検証用のDestinationはシステムの検証用アドレス (XRPL_VERIFY_ADDRESS)。
- 送金額は 1 drops (= 0.000001 XRP) で固定。
- 既存API:
  - POST /v1/cases/:caseId/assets/:assetId/verify/challenge
  - POST /v1/cases/:caseId/assets/:assetId/verify/confirm
- secretはフロントエンドでのみ使用し、保存しない。

## 変更概要
### UI/UX
- 資産詳細の「所有権を検証」ダイアログに以下を表示:
  - Destination: システム検証用アドレスであることを説明
  - Amount: 1 drops (=0.000001 XRP) を送る旨の説明
  - Memo: 自動発行された検証コード (読み取り専用、必要ならコピーのみ)
  - 入力: シークレットのみ (password)
  - ボタン: 「シークレットで自動検証」
- TX Hash入力欄と「検証を完了」ボタンは削除。

### 振る舞い
- ダイアログを開いた時点で challenge を自動発行。
  - 既存の verificationChallenge がある場合は再発行しない。
- 「シークレットで自動検証」押下時に以下を自動実行:
  1) createPaymentTx
  2) signSingle
  3) submitSignedBlob
  4) confirmVerify
- 成功時に資産詳細・履歴を再取得し、検証状態を更新。

### 実装方針
- 自動検証ロジックは再利用可能な関数に切り出す。
- AssetDetailPageはUIの簡素化と自動実行の呼び出しに専念。

## エラーハンドリング
- challenge未発行、secret未入力、送金失敗、検証失敗をそれぞれメッセージで表示。
- 送金/検証中は入力とボタンを無効化。

## テスト
- 自動検証関数の単体テストで、challenge取得→confirmVerifyまでのフローを検証。
- AssetDetailPageのレンダリングテストで:
  - TX Hash入力が表示されない
  - シークレット入力と自動検証ボタンがある

## 非対応
- サーバー側でsecretを受け取って検証する実装は行わない (セキュリティ上の理由)。
