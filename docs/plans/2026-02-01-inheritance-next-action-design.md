# 相続実行タブ「次のアクション」設計

**目的**
- 相続実行タブで、相続人が今やるべき行動を迷わず理解できるようにする。
- 「運営承認済み」以降の流れで、相続人同意がまだ完了していないことを明確に伝える。

**配置**
- `CaseDetailPage` の相続実行パネル内、「相続実行」見出し直下に配置する。
- 既存の署名セクションや死亡診断書セクションの邪魔にならないよう、軽いバナー（枠付き）で表示する。

**表示ステップ（A案）**
1. 運営承認済み
2. 相続人同意の準備中
3. 相続人同意 受付中
4. 同意完了（相続実行待ち）

**判定ロジック**
- 入力: `claim.status`, `case.stage`, `signerList.status`, `approvalTx.status`, `signerCompleted`
- ステップ判定:
  - `claim.status === "ADMIN_APPROVED"` かつ `case.stage === "WAITING"` → ステップ1
  - `case.stage === "IN_PROGRESS"` かつ `signerList.status !== "SET"` → ステップ2
  - `case.stage === "IN_PROGRESS"` かつ `signerList.status === "SET"` かつ `approvalTx.status === "PREPARED"` → ステップ3
  - `signerCompleted === true` または `approvalTx.status === "SUBMITTED"` → ステップ4
- 上記に当てはまらない場合はバナーを非表示（例: 運営確認中、差し戻し時など）。

**次のアクション文言（短文）**
- ステップ1: 「相続人の同意が必要です。死亡診断書の同意を進めてください。」
- ステップ2: 「同意の準備中です。しばらくお待ちください。」
- ステップ3: 「内容を確認して署名してください。」
- ステップ4: 「同意がそろいました。相続実行を待っています。」

**データフロー**
- `DeathClaimsPanel` に `onClaimChange` を追加し、取得/更新のたびに `CaseDetailPage` へ現在の `DeathClaimSummary` を渡す。
- `CaseDetailPage` は `deathClaim` を保持し、`resolveInheritanceNextAction()` で表示ステップと文言を算出する。
- 表示は相続実行タブ内に限定する。

**エラーハンドリング**
- `claim` が未取得/エラー時はバナーを出さない（既存のエラー表示に任せる）。

**テスト方針**
- `resolveInheritanceNextAction()` のユニットテストを追加し、主要な組み合わせでステップ・文言を検証する。
- UI は既存のレンダリングテストで確認できる範囲に留め、ロジックのテストを重視する。
