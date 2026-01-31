# 死亡診断書フロー（提出/運営承認/相続人同意）設計

## Goal
- 相続人が死亡診断書を提出し、運営承認と相続人過半数同意で死亡確定へ進める。
- 管理者UIを multi hosting の `apps/admin` で提供する。
- ファイルは PDF/JPG/PNG、1ファイル10MB。ファイル数は実装上の上限は設けず（UIは100件目安の注意を表示）。

## Scope
- Functions: 提出/アップロード許可/ファイル確定/運営承認/相続人同意 API を追加。
- Web: 相続人の専用ページ `/cases/:id/death-claims` を追加。
- Admin: 未承認一覧 → 詳細 → 承認の最小UIを追加。
- Storage Rules: `death-claims` 配下のアップロードをケースメンバーまたは管理者に限定。

## Architecture
- 相続人は `deathClaims` を作成し、ファイルは Storage へ直接アップロード。
- B要素として「アップロード許可レコード」を Firestore に発行し、Storage Rules で検証。
- 承認後は証跡を固定するため、`ADMIN_APPROVED` 以降はファイル追加不可。
- 相続人同意は **同意時点の受諾済み相続人（cases.memberUids から ownerUid を除外）** を分母に過半数判定。

## Data Model (Firestore)
- `cases/{caseId}/deathClaims/{claimId}`
  - `submittedByUid`
  - `status`: `"SUBMITTED" | "ADMIN_APPROVED" | "CONFIRMED"`
  - `adminApprovedByUid?`, `adminApprovedAt?`
  - `confirmedAt?`
  - `createdAt`, `updatedAt`
- `cases/{caseId}/deathClaims/{claimId}/files/{fileId}`
  - `storagePath`, `fileName`, `contentType`, `size`, `uploadedByUid`, `createdAt`
- `cases/{caseId}/deathClaims/{claimId}/uploadRequests/{requestId}`
  - `uid`, `fileName`, `contentType`, `size`, `expiresAt`, `status`: `"ISSUED" | "VERIFIED"`
- `cases/{caseId}/deathClaims/{claimId}/confirmations/{uid}`
  - `uid`, `createdAt`

## Storage Path & Rules
- Path: `cases/{caseId}/death-claims/{claimId}/{requestId}`
- Rules:
  - `request.auth != null`
  - `request.auth.uid` が `cases/{caseId}` の `memberUids` に含まれる **または** `request.auth.token.admin == true`
  - 対応する `uploadRequests/{requestId}` が存在し、`uid/contentType/size/期限` が一致

## API (Functions)
- `POST /v1/cases/:caseId/death-claims`
  - 相続人のみ。`status=SUBMITTED` 作成。
- `POST /v1/cases/:caseId/death-claims/:claimId/upload-requests`
  - `fileName/contentType/size` を受け取り許可レコード発行、`requestId/uploadPath` 返却。
- `POST /v1/cases/:caseId/death-claims/:claimId/files`
  - `requestId` を受け取り、Storage存在確認 → files に確定。
- `POST /v1/cases/:caseId/death-claims/:claimId/admin-approve`
  - `admin=true` のみ。`status=ADMIN_APPROVED` 更新。
- `POST /v1/cases/:caseId/death-claims/:claimId/confirm`
  - 相続人のみ。冪等。同意数が過半数に到達で `CONFIRMED` とし `cases.stage=IN_PROGRESS`。

## UI (Web)
- `/cases/:id/death-claims`
  - 提出状況、ファイル一覧、アップロードボタン、運営承認待ち/同意ボタンを表示。
  - `ADMIN_APPROVED` で同意ボタンを有効化。

## UI (Admin)
- `/` : `SUBMITTED` の一覧
- `/claims/:caseId/:claimId` : ファイル一覧と承認ボタン
- 認可: Firebase Custom Claims `admin=true`

## Error Handling
- 403: 権限なし（相続人/管理者の判定）
- 409: 既に同意済みなどの冪等処理
- 400: 期限切れやファイル情報不一致

## Testing
- Functions: 提出 → 承認 → 2/3 同意で `IN_PROGRESS`、1/3では未確定。
- Web: API クライアントのユニットテスト + 画面の表示テスト。
- Storage Rules: uploadRequests の一致がない場合の拒否を確認。

## Open
- admin claim の付与方法（運用スクリプト）
- UIでのファイル数が増えた場合のページング
