# Kototsute Architecture（Apps + Packages + DDD）

## 目的
- Web / Functions を「薄い層」にして、ドメイン実装を packages に集約する
- DDD の依存方向を守り、テスト容易性と再利用性を最大化する
- XRPL 連携は今は **stubのみ**（実処理は行わない）

---

## リポジトリ構成（概要）
```txt
apps/
  web/                        # UI（React）
    src/
      app/                    # 画面合成・DI（composition root）
      features/               # UI feature（Web固有）
        <feature>/
          components/
          hooks/
          types/
          funcs/
          const/
          index.ts
      ui/                     # 共通UI部品
      lib/                    # Firebase初期化/HTTPなど
      styles/                 # グローバルCSS等

  functions/                  # Firebase Functions（薄い層）
    src/
      index.ts                # Functions export
      # 原則: packages の usecase / infra を呼ぶだけ

packages/
  shared/                     # Shared Kernel（Time/Hash/TxId/DomainError/XRPL stub等）
  asset/                      # feature package（domain/application/infra）
  plan/
  death-attestation/
  case/
  audit/
  credential/

# ルート直下
pnpm-workspace.yaml
Taskfile.yml
firebase.json
```

---

## DDD層の構成（packages 側）
各 `packages/<feature>` は以下の層を持つ（必要に応じて）:

```
packages/<feature>/src/
  domain/        # エンティティ / Value Object / ルール
  application/   # usecase / port（interface）
  infra/         # 外部I/Oの実装（firebase-admin など）
```

### 依存方向ルール
- `domain` → 何にも依存しない
- `application` → `domain` にのみ依存
- `infra` → `application` の port を実装（Firebase SDK 等はここだけ）
- `apps/web` / `apps/functions` → `packages/*` を利用するだけ

---

## Web の設計（apps/web）
Webは UI 表示のための薄い層に限定し、ドメインは packages に寄せる。

- `features/<feature>`: Web固有の表示/状態/操作
- `ui`: 共通UI部品
- `lib`: Firebase初期化やAPIクライアント
- `app`: 画面合成と DI

### Web 側の役割
- UI state / ViewModel / 表示整形のみを持つ
- ドメイン型は `@kototsute/*` から参照
- `features` 間の直接依存は禁止（必要なら `ui` / `lib` に寄せる）

---

## Functions の設計（apps/functions）
Functions は **受け口＋DIのみ**。
- API/トリガで入力を受け、packages の usecase を呼ぶ
- Firebase Admin 実装は packages の `infra` に置く

---

## Shared Kernel（packages/shared）
- DomainError / Hash / TxId / Time / Result / Guard
- XRPL は **stub** を提供（実処理は行わない）

---

## XRPL 連携について
- `packages/shared/src/xrpl` に **port/stub** を配置
- 現時点では on-chain 操作は **行わない**

---

## Firebase での注意点
- `Timestamp` / `DocumentReference` を domain に入れない
- domain は `Date` / `string` などに寄せ、変換は `infra` に閉じ込める

---

## テスト方針
- packages の domain/usecase は **各 package で vitest**
- apps 側のテストは必要最小限
