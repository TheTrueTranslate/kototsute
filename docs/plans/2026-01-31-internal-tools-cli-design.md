# 内部CLIツール設計（管理者付与 / XRPL送金・発行）

**目的**
- ローカル開発環境で、管理者権限付与とXRPL操作を対話式で実行できる内部CLIを提供する。

**配置**
- `packages/internal` を新設（`private: true`）。
- `task tools:admin` / `task tools:xrpl` で起動。

**管理者付与CLI**
- Firebase Auth **エミュレータ専用**。
- 対象ユーザーはメールアドレスで指定。
- `admin: true` のカスタムクレームを付与。
- 既に `admin: true` の場合は変更なしで終了。
- `FIREBASE_AUTH_EMULATOR_HOST` が未設定なら `127.0.0.1:9099` を自動セット。
- `projectId` は `kototsute` を既定。

**XRPL CLI（mainnet固定）**
- 対話式で以下を選択:
  - XRP送金
  - NFTをMintして送信
  - 分割可能トークンを発行して送信（TrustSet自動）
- `XRPL_WS_URL` でWebSocketを上書き可能。未設定時は `wss://s1.ripple.com` を使用。
- seedは対話で非表示入力、ログに出さない。

**共通化**
- XRPL共通処理は `packages/shared` に移動し、functions と internal の両方から利用。

**エラーハンドリング**
- 失敗時は原因と次のアクションを簡潔に表示。

**テスト方針**
- XRPL共通モジュールはユニットテスト（xrplをモック）。
- CLIは最小限の薄いラッパーとし、ロジックは共通モジュールで担保。
