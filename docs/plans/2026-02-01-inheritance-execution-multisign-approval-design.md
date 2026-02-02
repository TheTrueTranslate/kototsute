# 相続実行 MultiSign 承認Tx 設計

## 目的
- 相続実行（MultiSign）を初心者でも進められるようにする。
- 承認TxのみをMultiSignで実行し、分配送金は後続処理で実行する。
- 署名対象Txの提示、署名手順のテンプレ化、システム署名の自動化を実装する。

## 前提
- SignerListSet は相続開始時に自動実行済み。
- 相続人は受取用ウォレットを登録・検証済み。
- 送金先アドレスは XRPL_VERIFY_ADDRESS を流用する。

## 方針
- 承認Txは Payment(1 drop) を利用する。
- Memo はランダム文字列1つのみ（JSON化しない）。
- 相続人はシークレットを毎回入力し、ブラウザ内で署名を行う（サーバーへ送らない）。
- 相続人は signed tx blob を提出し、サーバー側で署名を集約して submit_multisigned を実行する。

## UI/UX
- 相続人タブ「相続実行」に署名対象トランザクションを表示。
  - 送金元/送金先/金額/ Memo / Tx JSON を表示し、各項目にコピー機能を付与。
  - 署名手順は「シークレット入力 -> 署名生成 -> 署名送信」を明示。
  - 署名済みTxは表示・コピー可能。
- 管理画面に「相続実行Txを生成」ボタンを追加。
  - 生成済みなら状態を表示し、再生成は不可（必要なら別途相談）。

## API
- POST /v1/admin/cases/:caseId/signer-list/prepare
  - 管理者のみ。承認Txを生成し、システム署名済みblobを保存。
- GET /v1/cases/:caseId/signer-list/approval-tx
  - 相続人のみ。署名対象Txを取得。
- POST /v1/cases/:caseId/signer-list/sign
  - 相続人のみ。signed blob を提出。
  - 署名検証 -> 署名集約 -> submit_multisigned を実行。

## Firestore
- cases/{caseId}/signerList/approvalTx
  - memo: string
  - txJson: object
  - systemSignedBlob: string
  - systemSignedHash: string
  - status: PREPARED | SUBMITTED | FAILED
  - submittedTxHash: string | null
- cases/{caseId}/signerList/state/signatures/{uid}
  - uid, address, signedBlob, createdAt

## 検証ルール
- signed blob を decode し以下を厳格に検証:
  - Account == 分配用Wallet
  - Destination == XRPL_VERIFY_ADDRESS
  - Amount == 1 drop
  - Memo == approvalTx.memo
  - Signers[].Signer.Account == 相続人ウォレット
- 署名数が quorum 到達で multisign() を実行し submit_multisigned。
- 提出済みTx hash を保存。

## 非対象
- XUMM 等の外部ウォレット連携。
- 分配送金の自動実行フロー。
