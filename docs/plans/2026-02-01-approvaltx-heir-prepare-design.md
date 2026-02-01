# ApprovalTx作成の相続人移管設計

**目的**
- ApprovalTxの作成から運営の関与を外し、相続人が相続実行タブから準備できるようにする。
- 相続する可能性のある相続人のウォレットが全員分「登録済み＋確認済み」であることを保証してから処理に進む。

**変更範囲**
- 管理画面:
  - ApprovalTx作成ボタン・API・関連UIを削除
- Functions:
  - `admin-approve` 時の自動作成を削除
  - 相続人用の `POST /v1/cases/:caseId/signer-list/prepare` を追加
- 相続人画面（CaseDetailPage / 相続実行タブ）:
  - ApprovalTx作成を「相続人」から行うUIを追加
  - 全員分ウォレット確認済みでない場合は進めない案内を表示

**ApprovalTx作成の要件**
- ケースが `IN_PROGRESS`
- 相続人の受取用ウォレットが全員 `VERIFIED`
- 相続人が1人もいない場合は作成不可

**UI方針（相続人画面）**
- ボタン文言: **「相続同意の準備を始める」**
- 説明文: 「相続人の署名対象を作成します。全員の受取用ウォレットが確認済みである必要があります。」
- 未達成時の案内:
  - 「相続人の受取用ウォレットが全員分確認済みになると準備できます。」
  - 未確認人数が分かる場合は「未確認: X人」

**ロジック（UI側）**
- `listCaseHeirs` の `walletStatus` を用いて全員が `VERIFIED` かを判定
- `heirs.length === 0` の場合は作成不可（案内表示）

**ロジック（サーバー側）**
- `prepare` エンドポイント内で相続人ウォレットの全員確認を再チェック
- 未達成時は `HEIR_WALLET_UNVERIFIED` / `HEIR_MISSING` を返却

**削除する運営側の機能**
- 管理画面の「相続実行Txを生成」ボタン
- `apps/admin/src/api/signer-list.ts` および関連テスト
- Functions `admin` ルートの `/cases/:caseId/signer-list/prepare`
- `admin-approve` 時の `prepareInheritanceExecution` 呼び出し

**テスト方針**
- Functions: 相続人による `prepare` の成功/失敗ケース
- Web: 署名前提の案内／ボタンの活性条件
- Admin: 作成UI削除に伴うテスト更新/削除
