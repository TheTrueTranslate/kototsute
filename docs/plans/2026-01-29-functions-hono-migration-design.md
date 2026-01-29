# Functions -> Hono 移行設計（既存API互換）

## 目的
- apps/functions を Hono ベースに移行し、ルーティングを整理する
- 既存の API 仕様（パス/レスポンス/エラーコード）を完全互換で維持する
- 型は functions 内で管理し、共有ロジックがある場合のみ packages へ寄せる

## 前提
- Firebase Functions は `onRequest` で運用を継続する
- ベースパスは `/v1` を維持する
- 認証は全 API で `Authorization: Bearer <token>` を必須とする
- CORS は Hono middleware で現状の設定を維持する

## アーキテクチャ方針（ベストプラクティス）
- **Hono アプリを中心に構成**し、Functions 側は Hono を呼ぶ薄い層に限定する
- **サブアプリ分割**でコレクション/パス単位の境界を明確化する
- **共通 middleware（CORS/認証/エラー/404）** をアプリ初期化時に設定する
- **入力検証は Zod**（既存の @kototsute/shared の schema）を再利用する
- **型は functions 内で統一**し、routes から参照する

## 構成案
```
apps/functions/src/
  index.ts               # Functions export（onRequest）
  api/
    app.ts               # Hono 初期化（basePath/ミドルウェア/エラー）
    handler.ts           # Functions/Express 互換ハンドラー
    types.ts             # API Request/Response 型
    routes/
      assets.ts
      invites.ts
      plans.ts
      notifications.ts
    middlewares/
      auth.ts
    utils/
      response.ts
```

## ルーティング設計（既存互換）
- `/v1/assets`: GET/POST
- `/v1/assets/:assetId`: GET/DELETE
- `/v1/assets/:assetId/verify/challenge`: POST
- `/v1/assets/:assetId/verify/confirm`: POST
- `/v1/invites`: GET/POST
- `/v1/invites/:inviteId`: DELETE
- `/v1/invites/:inviteId/accept`: POST
- `/v1/invites/:inviteId/decline`: POST
- `/v1/plans`: GET/POST
- `/v1/plans/:planId`: GET/POST
- `/v1/plans/:planId/history`: GET
- `/v1/plans/:planId/assets`: GET/POST
- `/v1/plans/:planId/assets/:planAssetId/allocations`: POST
- `/v1/plans/:planId/heirs`: POST
- `/v1/plans/:planId/heirs/:heirUid`: DELETE
- `/v1/plans/:planId/assets/:planAssetId`: DELETE
- `/v1/plans/:planId/share`: POST
- `/v1/plans/:planId/inactivate`: POST
- `/v1/notifications`: GET
- `/v1/notifications/read-all`: POST
- `/v1/notifications/:notificationId/read`: POST

## 型設計
- `apps/functions/src/api/types.ts` に **Request/Response 型**を集約
- `ApiResponse<T>` と `ErrorResponse` を定義し、`routes/*` で共通利用
- 認証情報は `Context` の Variables に `auth` を持たせる

例:
```
export type AuthState = { uid: string; email?: string | null };
export type ApiResponse<T> = { ok: true; data: T } | ErrorResponse;
export type ErrorResponse = { ok: false; code: string; message: string };
```

## ミドルウェア
- **CORS**: Hono の `cors` を `app.use('*', cors(...))` で適用
- **認証**: `Authorization` を検証し `c.set('auth', ...)` へ注入
- **エラー**: `onError` で `DomainError`/`UNAUTHORIZED`/その他を分岐
- **404**: `notFound` で `{ ok:false, code:'NOT_FOUND', message:'Not found' }`

## 共通化方針
- **API 型は functions 内で管理**（packages へは寄せない）
- **新たな共通ロジックが増える場合のみ** `packages/shared` に追加を検討

## 移行ステップ
1. `api/app.ts` を追加し、Hono 初期化と共通 middleware を実装
2. `routes/*` に既存ロジックを移植（パス互換を維持）
3. `api/handler.ts` を Hono への橋渡し層に置き換え
4. `handler.test.ts` を維持し、互換性を確認
5. 旧 `createApiHandler` の分岐ロジックを削除

## テスト方針
- 既存の `apps/functions/src/api/handler.test.ts` を維持し互換性を担保
- ルート分割後も `handler(req,res)` の外形を維持する
- 必要に応じて Hono の `app.request()` でユニットテストを追加検討

## 非目的
- API 仕様の変更（リクエスト/レスポンス/ステータスの変更）
- Callable への移行
- packages 構成の大規模変更
