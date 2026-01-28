# ことづて（XRPL版）サービス概要・最小仕様書（MVP）

## 1. サービス概要（ひとことで）
「ことづて」は、**被相続者が生前に作った“指図（配分・連絡・手続方針）”の最新版**と、**死後の“死亡確定”と“実行結果（受付/完了）”**を、改ざん困難な形で一意に示すサービスです。個人情報はオンチェーンに載せず、XRPL上には**ハッシュ（指紋）と状態**のみを記録します。

- 目的：死後手続の「言った/言わない」「最新版どれ？」を消し、金融機関の処理をスムーズにする
- 手段：
  - **オフチェーン**：指図本体・書類・個人情報を暗号化保管
  - **オンチェーン（XRPL）**：指図/死亡確定/実行結果の**ハッシュとタイムスタンプ**をアンカー

---

## 2. 最小機能の範囲（MVP）
### 2.1 やること（MVPで必ずやる）
1) **被相続者アカウントの登録**（ユーザー登録）
2) **相続者アカウントの登録**（ユーザー登録）
3) **金融機関アカウントの登録**（※管理者が発行/有効化）
4) **指図パッケージ（Estate Plan）の作成・更新（版管理）**
5) **死亡確定（Death Attestation）の登録**（当面は運用審査→確定）
6) **金融機関向けケース（Case）の作成・提出パッケージ生成**
7) **金融機関の受領/完了レシート（Receipt）の記録**
8) **誰でも検証できる形で、XRPL上の状態を参照できる（監査/説明用）**

### 2.2 やらないこと（MVPではやらない）
- 相続税計算、遺産分割協議の合意形成、法務判断の自動化
- 銀行口座の名義変更・払戻しの自動実行（実行は金融機関の既存手続）
- 個人情報・書類画像のオンチェーン記録
- 資産のオンチェーン移転（エスクロー等）

---

## 3. 用語（この仕様書内の定義）
- **被相続者**：生前に「ことづて」を作成する本人
- **相続者**：死後手続を進める相続人/受遺者（※MVPでは「手続実行者」と同義で扱う）
- **金融機関**：銀行/証券/保険など、相続手続を受け付ける側
- **システム管理者**：ことづて運営（審査・権限付与・障害対応）

- **指図パッケージ（Instruction Bundle / Estate Plan）**：
  被相続者が残す「配分方針・連絡先・手続優先順位・必要情報の参照先」をまとめた電子文書（JSON/PDF等）
- **アンカー（Anchor）**：
  指図や証明書の**ハッシュ**をXRPLへ記録し、改ざん検出できるようにすること
- **ケース（Case）**：
  「金融機関1社 × 1手続単位」の処理単位（受付〜完了の進捗を持つ）
- **レシート（Receipt）**：
  金融機関が「受付/完了」した証跡（参照番号等）
- **ハッシュ（Hash）**：
  データの指紋。中身を晒さず同一性を証明する

---

## 4. 役割ごとの仕様（4者）

### 4.1 被相続者（生前の本人）
**目的**：自分の意思・指図の最新版を残す

- 権限
  - 指図パッケージの作成
  - 指図パッケージの更新（新バージョン発行）
  - 相続者（手続実行者）の指定（連絡先・権限範囲）
  - 閲覧権限の付与/取消（相続者に“プレビュー”を許可する等）

- 主要操作（MVP）
  1) `CreatePlan`：指図パッケージを登録
  2) `UpdatePlan`：指図パッケージを更新し最新版を切替

- 成果物
  - オフチェーン：暗号化された指図パッケージ本体
  - オンチェーン：指図パッケージのハッシュをアンカー（最新版の確定）

---

### 4.2 相続者（死後の手続実行者）
**目的**：死亡後、金融機関の相続手続を進める

- 権限
  - 死亡確定の申請（必要書類の提出）
  - 金融機関向けケースの作成
  - 必要書類の提出（オフチェーンへ）
  - 金融機関からの追加要求への対応

- 主要操作（MVP）
  1) `RequestDeathAttestation`：死亡確定申請（書類アップロード）
  2) `CreateCase`：金融機関ごとのケース作成
  3) `SubmitDocuments`：金融機関要件に合わせた書類提出
  4) `TrackStatus`：受付/差戻し/完了の追跡

- 成果物
  - 金融機関に提出する「指図パッケージ参照」「死亡確定証跡」「相続者本人確認」等のパッケージ

---

### 4.3 金融機関（銀行等）
**目的**：相続手続を安全に処理し、問い合わせ・差戻しを減らす

- アカウント
  - 金融機関アカウントは **管理者が発行/有効化**（Firebase Auth）
  - 権限は **XRPL Credential（例：KOTODUTE_FI）** により判定（最終的な認可はFunctions側）

- 権限
  - ケースの受領（受付）
  - 追加書類の要求（理由コード付き）
  - 手続完了の通知（参照番号付き）

- 主要操作（MVP）
  1) `AcknowledgeCase`：受付レシート発行
  2) `RequestMoreDocs`：追加要求（理由コード）
  3) `CompleteCase`：完了レシート発行

- 成果物
  - オフチェーン：受付番号、完了通知、提出書類の受領
  - オンチェーン：受領/完了に対応する状態更新（MPT/Receipt発行等）

---

### 4.4 システム管理者（運営）
**目的**：安全性（誤爆防止）と監査性（説明責任）を担保し、各者が動ける状態を作る

- 権限
  - 死亡確定の審査・確定（PoCでは運営が最終確定者）
  - 権限付与/剥奪（相続者の本人確認、金融機関アカウント発行・管理）
  - XRPL上のCredentials発行/失効（役割付与）
  - XRPL上のMPT発行・配布の実行（状態表現）
  - 監査ログ保全・障害対応

- 主要操作（MVP）
  1) `RegisterDecedent`：被相続者アカウント登録（または招待）
  2) `RegisterHeir`：相続者アカウント登録（または招待）
  3) `IssueFIAccount`：金融機関アカウント発行（Firebase Auth）
  4) `IssueCredential`：役割Credentialの発行/失効（KOTODUTE_HEIR / KOTODUTE_FI / KOTODUTE_ADMIN）
  5) `ApproveDeathAttestation`：死亡確定を確定
  6) `IssueMPT`：指図/死亡確定/レシート用MPTの発行・配布
  7) `AuditExport`：監査/説明用の証跡エクスポート

---

## 5. XRPL（オンチェーン）設計：最小形
### 5.1 方針
- XRPLは「個人情報の保管」ではなく、**証跡のアンカー台帳**として使う
- チェーンに載せるのは以下のみ
  - `bundle_hash`（指図パッケージのハッシュ）
  - `attestation_hash`（死亡確定パッケージのハッシュ）
  - `receipt_hash`（受付/完了レシートのハッシュ）
  - `type`（種別）と `case_id` / `plan_id`（識別子、ただし個人特定情報は含めない）

### 5.2 書き込み方法（MVP）
- XRPLトランザクションに **Memo** を添付し、以下の最小JSONを入れる（公開情報）

例（概念）：
- `type`: `PLAN_ANCHOR | DEATH_ATTEST | CASE_RECEIPT`
- `plan_id`: ランダムID（UUID等）
- `case_id`: ランダムID
- `hash`: SHA-256等
- `ver`: バージョン番号

> 注意：Memoは公開。個人名・口座番号・住所などは絶対に入れない。

### 5.3 多者承認（将来拡張：MVPでは任意）
- 誤爆防止を強くする場合、XRPLの **SignerListSet（マルチシグ）** を用いて
  - 「死亡確定アンカーは 2-of-3 署名が必要」
  などに拡張できる

---

## 6. オフチェーン設計（最小）
### 6.1 保管
- 指図パッケージ・提出書類・レシート原本：暗号化オブジェクトストレージ（追記型ログ含む）
- 監査ログ：追記のみ（イベントソーシング）＋WORM相当の保管（改ざん困難化）

### 6.2 暗号化・鍵
- 鍵はKMS/HSMで管理
- 可能なら「被相続者のデータはクライアント側暗号化」し、運営が平文を見なくて済む設計を優先

---

## 7. 提供API（最小セット）
※フロントは対象外。ここではサーバAPIのみ。

### 7.1 共通
- `POST /v1/auth/*`：本人確認・トークン発行（詳細は省略）
- `GET  /v1/public/xrpl/tx/{txid}`：アンカー検証（公開）

### 7.2 被相続者向け
- `POST /v1/plans`：指図作成（本文は暗号化アップロード→参照のみ）
- `PUT  /v1/plans/{plan_id}`：指図更新（新バージョン）
- `GET  /v1/plans/{plan_id}`：自分の指図参照

### 7.3 相続者向け
- `POST /v1/death-attestations`：死亡確定申請
- `POST /v1/cases`：金融機関ケース作成
- `POST /v1/cases/{case_id}/documents`：書類提出
- `GET  /v1/cases/{case_id}`：進捗取得

### 7.4 金融機関向け
- `POST /v1/cases/{case_id}/ack`：受付（受付番号・レシート原本）
- `POST /v1/cases/{case_id}/requests`：追加書類要求（理由コード）
- `POST /v1/cases/{case_id}/complete`：完了（完了番号・レシート原本）

### 7.5 管理者向け
- `POST /v1/admin/death-attestations/{id}/approve`：死亡確定
- `POST /v1/admin/xrpl/anchor`：アンカー送信
- `GET  /v1/admin/audit/export`：監査出力

---

## 8. 状態モデル（最小）
### 8.1 Plan
- `DRAFT` → `ACTIVE(ver=n)` → `ACTIVE(ver=n+1)` …（最新版のみが有効）

### 8.2 Death Attestation
- `REQUESTED` → `APPROVED`（ここでオンチェーンアンカー）

### 8.3 Case
- `CREATED` → `ACKNOWLEDGED` → `NEED_MORE_DOCS`（任意回数）→ `COMPLETED`

---

## 9. 主要フロー（MVP）
### 9.1 生前：指図作成
1) 被相続者が指図パッケージを作成（オフチェーン保存）
2) システムがハッシュを計算
3) 管理者がXRPLへアンカー（または自動）
4) `plan_id` と `txid` を記録（誰でも検証可能）

### 9.2 死後：死亡確定
1) 相続者が死亡確定申請（書類提出）
2) 管理者が審査・確定
3) 死亡確定パッケージのハッシュをXRPLにアンカー

### 9.3 金融機関手続
1) 相続者が金融機関ごとにケース作成
2) 提出パッケージ（指図参照＋死亡確定証跡＋本人確認）を渡す
3) 金融機関が受付/追加要求/完了をAPIで返す
4) 受付/完了レシートのハッシュを（任意で）XRPLにアンカー

---

## 10. 最小のセキュリティ要件（必須）
- 個人情報はオンチェーンに置かない（Memoは公開）
- 暗号化（保存/転送）と強固な鍵管理（KMS/HSM）
- 役割ベースのアクセス制御（4者で厳密に分離）
- 監査ログ：追記のみ＋改ざん検知（WORM相当）
- 死亡確定は誤爆防止のため、MVPでは必ず運営審査を挟む

---

## 11. 拡張ポイント（MVP後）
- 死亡確定を多者署名（マルチシグ）で強化（誤爆耐性）
- 行政の電子化（死亡届等）に接続し、確定の自動化を段階的に引き上げ
- 金融機関連携の標準プロトコル化（理由コード・提出パッケージの統一）

---

## 付録：最小データ項目（オンチェーンに載せない/載せる）
### A) オンチェーン（XRPL）
- `type`, `plan_id`, `case_id`, `hash`, `ver`, `timestamp`, `txid`

### B) オフチェーン（暗号化）
- 指図本文、書類原本、本人/相続者情報、金融機関受付番号、連絡先



---

## 12. 実装方針（Pythonサーバ / TypeScriptクライアント）
### 12.1 結論
- **サーバ：Python（FastAPI + xrpl-py）**
- **クライアント：TypeScript（必要なら xrpl.js で署名/検証）**
がMVPとして現実的。

### 12.1.1 Next.jsについて（PoC判断）
- **必須ではない**（SSR/SEO/複雑なルーティングが不要なら、静的SPAで十分）
- PoCでは「実装速度」と「配信の簡単さ」を優先し、
  - Next.jsを使うなら **静的出力（SSG）寄り**
  - もしくはVite等の軽量SPA
  のどちらでもOK（仕様としてはフレームワーク非依存）

### 12.2 役割分担（最小・安全寄り）
- クライアント（TypeScript）
  - 指図パッケージ作成UI（※本仕様ではフロント詳細は除外）
  - **指図本文・提出書類の暗号化**（可能ならクライアント側暗号化）
  - 本人署名（運営が本人鍵を預からない設計が望ましい）
- サーバ（Python）
  - 認証/権限（RBAC）
  - 監査ログ・ケース管理・金融機関API
  - **XRPLアンカー送信（運営署名）**
  - XRPL txの確定（validated）監視・リトライ

---

## 13. 管理者アカウントは必要か（XRPL / DB 多角的整理）
### 13.1 DB側（必須）
- **管理者ロールは必須**：死亡確定の審査、金融機関テナント管理、監査ログ保全、障害対応のため。
- ただし、管理者が個人情報を“閲覧できる”必要はない（暗号化と権限分離で最小化）。

### 13.2 XRPL側（MVPでは推奨＝実質必須）
- XRPLに「管理者」概念はないが、**アンカー取引を送る主体（運営ウォレット）**は必要。
- 理由：
  - 死亡確定は誤爆防止のため、MVPでは「運営審査→確定」が現実的
  - 指図・死亡確定・レシートのアンカーを安定運用するため
- 代替案（MVP後）
  - 死亡確定アンカーを **マルチシグ（2-of-3等）** にして、運営が単独で確定できない構造に拡張可能

---

## 14. どのデータをどこで発行するか（Wallet / データ / 鍵）
### 14.1 発行物と責任分界（MVP）
- 被相続者
  - 発行：指図パッケージ本文（オフチェーン）
  - 署名：本人署名（推奨。運営が本人鍵を預からない）
  - アンカー：本文ハッシュ（オンチェーン）
- 相続者
  - 発行：死亡確定“申請”パッケージ（オフチェーン）
  - 署名：申請者署名（提出者として）
- 金融機関
  - 発行：受付/完了レシート原本（オフチェーン）
  - 署名：機関署名またはAPI署名（任意だが強い）
  - アンカー：レシート原本ハッシュ（オンチェーン：推奨）
- システム管理者（運営）
  - 発行：死亡確定“承認”証明（オフチェーン）
  - 署名：運営署名（またはマルチシグの一員）
  - アンカー：承認証明ハッシュ（オンチェーン）

### 14.2 鍵（秘密鍵）の置き場（推奨）
- 被相続者の秘密鍵：クライアント端末 / 外部ウォレット（運営は預からない）
- 運営の秘密鍵：サーバ側（KMS/HSM等で保護）
- 金融機関の秘密鍵：金融機関側（運営は預からない）

---

## 15. XRPLで使う機能（MVP：MPT × Credentials）
> 以前の「Memoでハッシュをアンカー」案はPoCでは有効だが、今回のMVPは **MPT（Multi-Purpose Tokens）× Credentials** を主軸にする。

### 15.1 Credentials（権限・役割のオンチェーン証明）
**目的**：相続者/金融機関/運営などの「役割」と「許可」をオンチェーンで検証可能にする。

- **CredentialCreate**：発行者（例：運営 or KYC実施者）が、対象（Subject）に資格情報を“仮発行” ([xrpl.org](https://xrpl.org/docs/references/protocol/transactions/types/credentialcreate?utm_source=chatgpt.com))
- **CredentialAccept**：対象アカウントが資格情報を受諾して有効化 ([xrpl.org](https://xrpl.org/docs/references/protocol/transactions/types/credentialaccept?utm_source=chatgpt.com))
- **CredentialDelete**：発行者または保有者が失効（撤回） ([xrpl.org](https://xrpl.org/docs/references/protocol/transactions/types/credentialdelete?utm_source=chatgpt.com))

PoCで扱う最小Credential Type例（文字列→Hex等に変換して利用）
- `KOTODUTE_HEIR`（相続者である/手続実行者）
- `KOTODUTE_FI`（金融機関オペレーター）
- `KOTODUTE_ADMIN`（運営）

### 15.2 MPT（状態を表すトークン化：発行IDで追跡）
**目的**：指図・死亡確定・レシート等の「状態」を、MPTの発行（Issuance）と移転で表現し、台帳上で追跡できるようにする。

- MPTはXRPLの**ファンジブル（同質）トークン**で、効率性・設定の扱いやすさを重視した設計 ([xrpl.org](https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens))
- 各MPT発行は **MPTokenIssuanceID** で一意に識別される ([xrpl.org](https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens))

PoCで使う最小トランザクション
- **MPTokenIssuanceCreate**：指図/死亡確定/レシート用のMPT発行を作成 ([xrpl.org](https://xrpl.org/docs/references/protocol/transactions/types/mptokenissuancecreate?utm_source=chatgpt.com))
- **MPTokenAuthorize**：保有者（相続者/金融機関）の保有許可・ホワイトリスト（必要な場合） ([xrpl.org](https://xrpl.org/ja/docs/references/protocol/transactions/types/mptokenauthorize?utm_source=chatgpt.com))
- **Payment（MPT）**：発行済みMPTを相続者・金融機関へ送付して状態通知（MPTは支払いで配布できる） ([xrpl.org](https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens))

MPTのPoC運用ルール（最小）
- 役割（Credentials）を持つアカウントだけが、対象MPTを受け取れる/扱える運用にする（オフチェーンで検証してから実行） ([xrpl.org](https://xrpl.org/docs/concepts/decentralized-storage/credentials))
- 1発行=1用途（PLAN / DEATH / RECEIPT）で分け、**メタデータはPIIを含めず**、オフチェーンの暗号化データ参照（URLではなくIDやハッシュ）に留める

---

## 16. サーバー構成（決定：Firebase + Cloud Functions（TypeScript）/ PoC最小）
- Hosting：Firebase Hosting（静的配信）
- Auth：Firebase Authentication
- DB：Cloud Firestore（Plan/Case/Status/AuditLog）
- Storage：Cloud Storage（指図本文・書類原本：暗号化）
- Backend：Cloud Functions（TypeScript, 2nd gen推奨）
  - HTTP：API（plan/case/receipt/attestation）
  - Scheduled：再試行（tx検証、未完了処理）
- Secrets：Secret Manager（運営のXRPL鍵、XRPL接続情報）
- KMS：Cloud KMS（暗号鍵）
- Scheduler：Cloud Scheduler（定期実行 → Functions）
- Observability：Cloud Logging / Cloud Monitoring

---

## 17. 運用ルール（PoCの安全策：MPT×Credentials版）
- オンチェーンには**個人情報を載せない**（CredentialTypeやMPTメタデータにPIIを入れない） ([xrpl.org](https://xrpl.org/docs/concepts/decentralized-storage/credentials))
- 役割管理はCredentialsで行い、
  - 相続者/金融機関/運営の権限を **Credentialの有効状態**で判定（オフチェーンでも検証） ([xrpl.org](https://xrpl.org/docs/concepts/decentralized-storage/credentials))
- 死亡確定は誤爆防止のため、PoCでは **運営承認（管理者）を必須**（将来は多者承認へ）
- MPT発行・配布は冪等（同一ケースに二重発行しないようFirestoreで一意制約を設計）
- XRPL取引は txid を保存し、validated確認までは `PENDING` として扱う（Schedulerで追跡）

---

## 18. インフラ実行プラン（決定：Firebase優先・PoC最小）
### 18.1 目的
- PoCで「慣れている環境」「最短実装」「低運用負荷」を優先

### 18.2 構成（決定事項）
- Firebase Hosting + Firebase Auth
- Firestore + Cloud Storage
- Cloud Functions（TypeScript）
- Secret Manager + Cloud KMS
- Cloud Scheduler（定期ジョブ）
- Cloud Logging/Monitoring

### 18.3 運用（最小）
- 環境：dev / prod（PoCはstg省略可）
- 変更管理：Git連携（Hosting/FunctionsはCIでデプロイ）
- 監査ログ：Firestoreに追記＋定期的にStorageへエクスポート（長期保管）
- 監視KPI：APIエラー率・遅延・XRPL tx失敗率・未validated件数

---

## 19. フロントの配信（決定：Firebase Hosting / Multi Hosting）
### 19.1 方針
- **ユーザー画面** と **金融機関（FI）画面** を、Firebase Hosting の **複数サイト（Multi Hosting）** で分離して配信する。
- 分離のメリット：
  - デプロイ分離（UI改修の影響範囲を限定）
  - ルーティング/権限/UIを分けやすい
  - ドメイン分離も可能（後で監査・セキュリティ説明がしやすい）

### 19.2 配信構成（PoC）
- Hosting Sites（同一Firebaseプロジェクト内で複数）
  - `kotodute-user`：ユーザー画面
  - `kotodute-fi`：金融機関画面
- ドメイン（例）
  - ユーザー：`app.example.com`（または `kotodute-user.web.app`）
  - FI：`fi.example.com`（または `kotodute-fi.web.app`）

### 19.3 認証・権限（最低限）
- 認証：Firebase Auth
- 画面アクセス制御：
  - FIサイトは **FI用Credential（例：KOTODUTE_FI）** を持つアカウントのみ利用可能
  - ユーザーサイトはユーザー/相続者用Credentialで制御
- 実装は「フロントで隠す」ではなく、**Cloud Functions側で認可**（Credential検証）を必須とする

### 19.4 API接続
- フロント → Cloud Functions（HTTPS）
- Firebase AuthのIDトークンを添付し、Functions側で検証
- Functions側でXRPLのCredential状態を確認し、許可された操作のみ実行

### 19.5 デプロイ運用（最小）
- 2つのHostingターゲットを `firebase.json` で定義し、個別にデプロイ可能にする
  - 例：`firebase deploy --only hosting:kotodute-user`
  - 例：`firebase deploy --only hosting:kotodute-fi`

