# shadcn/ui 移行・運用方針

## 目的
- 既存UIを shadcn/ui に段階的に移行する
- shadcn/ui の「コピー＆オーナーシップ」前提で、更新可能な運用にする

## shadcn/ui の特性（前提）
shadcn/ui は **npm パッケージをアップデートする方式ではなく、コンポーネントコードをリポジトリにコピーして所有する方式**。
更新は「最新版を再導入」または「差分を取り込み」によって行う。

## ディレクトリ方針
- **上流の shadcn/ui は `apps/web/src/components/ui/*` に配置**（基本は触らない）
- **カスタムはラッパー（proxy）で行う**
  - 例: `apps/web/src/components/form-field.tsx`
  - 例: `apps/web/src/components/form-alert.tsx`
- 画面や機能特化のUIは `apps/web/src/components/` に集約

## 既存UIの移行方針
- `@kototsute/ui` の Button / Input / FormAlert / FormField / AuthLayout などは、
  **apps/web側で shadcn/ui ベースに置き換える**
- 画面は順次 shadcn/ui の `Button` / `Input` / `Alert` / `Label` に移行
- 既存の見た目は `auth-layout.module.css` など **ローカルCSSを維持**しつつ、
  内部パーツを shadcn/ui コンポーネントに置き換える

## 更新フロー（推奨）
以下は **公式の更新フロー**をベースにした運用手順。

### 1. まずコミット
CLI は既存ファイルを上書きするため、**先にコミットして退避**する。

### 2. 差分確認（任意だが推奨）
- 変更があるコンポーネントを洗い出す:
  ```bash
  npx shadcn@latest diff
  ```
- 特定コンポーネントだけ:
  ```bash
  npx shadcn@latest diff button
  ```

### 3. 更新を適用
- 特定コンポーネントを上書き更新:
  ```bash
  npx shadcn@latest add button --overwrite
  ```
- 全体を最新版に揃える:
  ```bash
  pnpm dlx shadcn@latest add --all --overwrite
  ```

### 4. 自分のカスタムを戻す
- `components/ui/*` は原則素のまま
- 追加スタイルや挙動は **ラッパー側に戻す**

## カスタムが怖い場合の対策
- **ui コンポーネント自体を直接いじらない**
- 代わりに `MyButton` などのラッパーを作る
- 更新時は `add ... --overwrite` を使い、ラッパーで差分を吸収する

## 移行ステップ（このリポジトリ）
1. `apps/web` に shadcn/ui を導入
2. `Button / Input / Alert / Label` など基本UIを置き換える
3. 画面側で `@kototsute/ui` の参照を段階的に削除
4. デザインや挙動の差分は `components/` 側で吸収

## 参考
- shadcn/ui 更新と運用: https://vercel.com/academy/shadcn-ui/updating-and-maintaining-components
- shadcn/ui Tailwind v4: https://ui.shadcn.com/docs/tailwind-v4
- CLI diff: https://ui.shadcn.com/docs/changelog/2023-06-new-cli
- migrate コマンド: https://ui.shadcn.com/docs/changelog/2025-06-radix-ui
