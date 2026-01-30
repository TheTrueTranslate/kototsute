# ケース「タスク」機能 設計

## 背景
- ケースに対して、被相続人・相続人の両者が確認できる「やることリスト（タスク）」を持たせたい。
- タスクはケースの進捗やステータスに影響させない。
- Todo マスターはいつでも更新可能で、進捗データは「完了したタスクID」だけを保持する。

## ゴール
- ケース詳細に「タスク」タブを追加し、共有タスクと個人タスクをチェックできる。
- Todo マスターはコード（packages）に置き、内容変更に強い設計にする。
- 完了状態は Firestore に保存し、再読み込みしても反映される。

## 非ゴール
- ケースステータス連動 / 自動進行。
- 高度な権限・監査・通知。
- タスク編集UI（マスター更新はコード変更で対応）。

## 仕様
### 1. Todo マスター
- 場所: `packages/tasks`
- 形式: `shared` / `owner` / `heir` の3配列を export
- 各タスク項目の最小属性:
  - `id` (string)
  - `title` (string)
  - `description` (string, optional)
  - `priority` (number, optional)
  - `requiresWallet` (boolean, optional)

### 2. 保存データ（Firestore）
- 共有タスク:
  - `cases/{caseId}/taskProgress/shared`
  - `completedTaskIds: string[]`
  - `updatedAt: Timestamp`
- 個人タスク:
  - `cases/{caseId}/taskProgress/users/{uid}`
  - `completedTaskIds: string[]`
  - `updatedAt: Timestamp`

### 3. 参照/更新API
- 読み込み:
  - `GET /v1/cases/:caseId/task-progress`
  - 返却: `{ sharedCompletedTaskIds: string[], userCompletedTaskIds: string[] }`
- 更新:
  - `POST /v1/cases/:caseId/task-progress/shared`
  - `POST /v1/cases/:caseId/task-progress/me`
  - 送信: `{ completedTaskIds: string[] }`
  - 返却: ok

### 4. UI/UX
- ケース詳細に「タスク」タブを追加。
- 上段: 共有タスク / 下段: 自分用タスク。
- タスクはチェックボックス + タイトル + 説明。
- `priority` が高いものを上に表示。
- `requiresWallet` が true の場合、相続人のWallet未登録時に注意バッジを表示。
- チェック操作は即時反映（楽観更新 + 保存失敗時に戻す）。

### 5. 権限
- `case.ownerUid` または `case.memberUids` に属するユーザーのみ読み書き可能。
- 個人タスクは auth.uid のドキュメントのみ更新可能。

## データ整合性方針
- マスターに存在しない `completedTaskIds` は UI 表示で無視。
- マスター側で追加されたタスクは未完了として表示。

## 想定されるエッジケース
- マスター更新でIDが削除された場合 -> UIから非表示。
- 共有/個人の保存が失敗 -> UIを元に戻しエラー表示。

## 影響範囲
- Web: ケース詳細 UI、API呼び出し。
- Functions: タスク進捗API。
- Firestore rules: `taskProgress` 書き込み権限追加。
- Packages: `packages/tasks` 新設。
