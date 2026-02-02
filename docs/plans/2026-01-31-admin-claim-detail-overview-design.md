# 管理画面 申請詳細の概要表示 設計

**目的**
- 管理画面の申請詳細で、提出ファイルとケース情報を「概要」レベルで確認できるようにする。

**方針**
- Functions の admin 詳細 API はケース情報を追加で返す。
- 提出ファイルは既存情報に加え、`createdAt` / `storagePath` / `uploadedByUid` を返す。
- 画面は「ケース概要」「提出ファイル」セクションを追加し、最小限の項目を表示する。

**API 変更（admin detail）**
- 既存: `GET /v1/admin/death-claims/:caseId/:claimId`
- 追加: `case` フィールド
  - `caseId`
  - `ownerDisplayName`
  - `stage`
  - `assetLockStatus`
  - `memberCount`
  - `createdAt`
- `files` の拡張
  - `createdAt`
  - `storagePath`
  - `uploadedByUid`

**UI 変更（ClaimDetailPage）**
- 「ケース概要」セクションを追加
  - Case ID / 被相続人名 / ステージ / 相続人数 / 作成日時
- 「提出ファイル」一覧にメタ情報を追加
  - 種別 / サイズ / 作成日時 / uploader
  - storagePath は必要に応じて表示（ダウンロード導線が必要なら後で追加）

**テスト方針**
- functions の admin detail API テストを更新（case と files の拡張）
- admin 側 API 型・テストを更新

**ビルド**
- Functions を変更したら `task functions:build` を実行
