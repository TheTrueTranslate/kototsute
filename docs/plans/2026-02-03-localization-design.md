# ローカライズ設計（i18next 共有方式）

## 目的
- `apps/web` と `apps/admin` の UI を日本語/英語に対応する
- バックエンド（Functions/Tasks）のエラー・バリデーション・メール文言を日本語/英語に対応する
- 翻訳リソースを **1フォルダ** で一元管理する

## 非目的
- 多言語（3言語以上）への拡張は今回のスコープ外
- 既存文言の全面的なリライトは後続

## 方針
- **i18next を共通基盤**にして、翻訳リソースは `packages/shared/src/locales/` に集約
- フロントは `react-i18next`、バックエンドは `i18next` を使用
- 翻訳キーは `common.*`, `nav.*`, `form.*`, `errors.*`, `emails.*` など目的別プレフィクスで統一

## 共有モジュール
```
packages/shared/
  src/
    locales/
      ja.json
      en.json
    i18n.ts
```

`i18n.ts` の責務:
- i18next 初期化（`resources`, `fallbackLng: "ja"`, `supportedLngs: ["ja","en"]`）
- `t(key, params?, locale?)` を提供
- `setLocale(locale)` / `getLocale()` を提供（フロントで `changeLanguage` のラッパーとして使用）

## フロント（apps/web, apps/admin）
- 認証済みユーザーは Firestore `users/{uid}.locale` を優先
- 未ログイン時は `navigator.language` を `ja/en` に正規化し、`localStorage` に保存
- マイページで `locale` を変更し Firestore を更新、即時反映
- `I18nextProvider` または `initReactI18next` を使用してコンポーネント側は `t()` 参照

## バックエンド（apps/functions, packages/tasks）
- リクエストの `X-Locale` ヘッダー or 認証済み uid の Firestore `users/{uid}.locale` を採用
- エラー文言は **文字列直書き禁止**。`ERR_*` コードと i18n キーを対応
- 返却形式は `{ code, message }` を基本とし、`message` は i18n 経由で生成
- メール/通知は `emails.*` のキーを使い、テンプレートに `t()` を差し込む

## データモデル
- Firestore `users/{uid}` に `locale: "ja" | "en"` を追加

## 欠落キー/フォールバック
- `fallbackLng: "ja"` に統一
- 欠落キーはログ警告（将来的に監視対象化）

## テスト
- `packages/shared` に「全キーが `ja/en` で一致する」検証テストを追加
- 主要 API エラー文言とメール文言のスナップショットテストを追加

## ロールアウト手順（概要）
1. `packages/shared` に `locales` と `i18n.ts` を追加
2. `apps/web` / `apps/admin` に `react-i18next` を導入
3. 主要画面から段階的に文言を置き換え
4. `apps/functions` / `packages/tasks` のエラー・メール文言を置き換え

## 既知のリスク
- 翻訳キーの粒度が粗いと再利用性が下がる（プレフィクス設計を重視）
- 初期読み込み時の言語決定でちらつきが起きる可能性（`localStorage` 先行読み）
