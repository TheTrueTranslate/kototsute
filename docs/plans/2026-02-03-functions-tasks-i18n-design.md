# Functions / Tasks i18n Design

## Goal
- Functions のレスポンス `message` は **キー文字列のみ**を返す。
- Tasks の `description` は **キー文字列**に変更し、Web で翻訳する。
- 翻訳資産は `packages/shared/src/i18n/consts/{ja,en}.json` に一本化。

## Decisions
- Functions の `jsonError` / `jsonOk` は `message` にキーを入れる。
- 動的値が必要な場合は **追加フィールド**で渡す（例: `messageValues`）。
  - Web は `t(message, messageValues)` で表示。
- 通知は Firestore 上で `title`/`body` を **キー**として保存し、必要なら `meta` で差し込み値を保持。
- Tasks は `packages/tasks/src/todo-master.ts` の `description` をキー化。

## Key layout (例)
- `functions.errors.*`
- `functions.notifications.*`
- `tasks.todo.owner.*`, `tasks.todo.heir.*`

## Impacted Areas
- `apps/functions/src/api/routes/*.ts` の日本語文言
- `packages/tasks/src/todo-master.ts`
- Web 表示側 (`CaseDetailPage`, Notifications)
- `apps/functions` のテスト期待値

## Constraints
- リポジトリ規約により `git worktree` は使用しない。
- Functions 修正後は `task functions:build` を実行する。
