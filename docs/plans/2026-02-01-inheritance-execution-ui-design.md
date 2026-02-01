# 相続実行タブ（死亡診断書折りたたみ + MultiSign署名UI）デザイン

## 目的
- 「死亡診断書」タブを「相続実行」タブに変更し、相続実行に必要な MultiSign 署名（SignerListSet 前提）を行うUIを追加する。
- 死亡診断書の情報は折りたたみで残しつつ、相続実行の導線を明確にする。

## 画面構成
- タブ名: 「相続実行」
- セクション1: 「死亡診断書（折りたたみ）」
  - 既存の `DeathClaimsPanel` をそのまま配置。
  - タブ切り替え時の挙動は維持し、詳細は任意で開閉可能。
- セクション2: 「MultiSign署名」
  - SignerListSet の状態（準備中 / 準備済み / 失敗）を表示。
  - 署名状況（提出数 / 必要数）と自身の署名状況を表示。
  - 署名提出は「TXハッシュ」入力のみ（A方式）。

## 状態・表示ルール
- 署名受付は `case.stage === IN_PROGRESS` かつ `signerList.status === SET` のときのみ有効。
- 未準備の場合は入力欄とボタンを disabled にし、理由を表示。
- 署名完了判定は「相続人の過半数（floor(heirCount/2)+1）に達したか」でUI上の完了表示。

## API
- `GET /v1/cases/:caseId/signer-list`
  - 返却: signerList 状態, quorum, 署名数, 必要数, 自分の署名状態, エラー情報
- `POST /v1/cases/:caseId/signer-list/sign`
  - 送信: { txHash }
  - 返却: 最新の署名数 / 必要数 / 自分の署名状態

## Firestore
- 署名記録: `cases/{caseId}/signerList/state/signatures/{uid}` に保存
  - `uid`, `address`, `txHash`, `createdAt`

## 非対象
- XUMM 等のウォレット連携導線
- MultiSign 署名トランザクションの生成
