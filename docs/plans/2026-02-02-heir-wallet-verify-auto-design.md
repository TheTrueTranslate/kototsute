# 相続人ウォレット検証の自動化 (シークレット入力のみ)

## 目的
- 相続人の受取用ウォレット検証を「シークレット入力のみ」で完結させる。
- Destination/Memo/Amountは自動発行・固定値とし、TX Hash入力を廃止する。
- 送金から検証完了までを自動で実行する。

## 前提
- 既存APIを利用:
  - POST /v1/cases/:caseId/heir-wallet/verify/challenge
  - POST /v1/cases/:caseId/heir-wallet/verify/confirm
- secretはフロントエンドでのみ使用し、保存しない。

## 変更概要
### UI/UX
- ケース詳細「受取用ウォレット」タブの検証ダイアログ:
  - Destinationラベルを「Destination（運営確認用ウォレット）」に変更
  - 送金先はシステムの検証用アドレスである旨を表示
  - Amountは固定: 1 drops (=0.000001 XRP) を送信する旨を表示
  - Memoは自動発行された検証コードを表示 (読み取り専用)
  - 入力はシークレットのみ
  - TX Hash入力欄・コピー系ボタンは削除

### 振る舞い
- ダイアログオープン時に challenge を自動発行。
  - 既存の challenge がある場合は再発行しない。
- 「シークレットで自動検証」押下で以下を自動実行:
  1) createPaymentTx
  2) signSingle
  3) submitSignedBlob
  4) confirmHeirWalletVerify
- 成功時にウォレット情報を再取得し、検証状態を更新。

## エラーハンドリング
- challenge未発行、secret未入力、送金失敗、検証失敗を表示。
- 送金/検証中は入力とボタンを無効化。

## テスト
- 画面テストで:
  - 「Destination（運営確認用ウォレット）」表示
  - 1 drops 説明表示
  - TX Hash入力が表示されない
  - 自動検証ボタンが表示される

## 非対応
- サーバー側でsecretを受け取って検証する実装は行わない (セキュリティ上の理由)。
