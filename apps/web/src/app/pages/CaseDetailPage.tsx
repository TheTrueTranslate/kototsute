import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import { Button } from "../../features/shared/components/ui/button";
import { Input } from "../../features/shared/components/ui/input";
import { getCase, type CaseSummary } from "../api/cases";
import { listAssets, type AssetListItem } from "../api/assets";
import { listPlans, type PlanListItem } from "../api/plans";
import {
  createInvite,
  listCaseHeirs,
  listInvitesByOwner,
  type CaseHeir,
  type InviteListItem
} from "../api/invites";
import { useAuth } from "../../features/auth/auth-provider";
import styles from "../../styles/caseDetailPage.module.css";
import { relationOptions } from "@kototsute/shared";

const statusLabels: Record<string, string> = {
  DRAFT: "下書き",
  WAITING: "相続待ち",
  IN_PROGRESS: "相続中",
  COMPLETED: "相続完了"
};

const formatDate = (value: string) => {
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "-";
  }
};

type TabKey = "assets" | "plans" | "heirs" | "documents";

export default function CaseDetailPage() {
  const { caseId } = useParams();
  const { user } = useAuth();
  const [caseData, setCaseData] = useState<CaseSummary | null>(null);
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [ownerInvites, setOwnerInvites] = useState<InviteListItem[]>([]);
  const [heirs, setHeirs] = useState<CaseHeir[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRelation, setInviteRelation] = useState(relationOptions[0]);
  const [inviteRelationOther, setInviteRelationOther] = useState("");
  const [inviteMemo, setInviteMemo] = useState("");
  const [inviting, setInviting] = useState(false);
  const [tab, setTab] = useState<TabKey>("assets");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  const title = useMemo(
    () => caseData?.ownerDisplayName ?? "ケース詳細",
    [caseData]
  );

  useEffect(() => {
    if (!caseId) {
      setError("ケースIDが取得できません");
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const detail = await getCase(caseId);
        setCaseData(detail);
        const owner = detail.ownerUid === user?.uid;
        setIsOwner(owner);
        if (owner) {
          const [assetItems, planItems, inviteItems] = await Promise.all([
            listAssets(caseId),
            listPlans(caseId),
            listInvitesByOwner(caseId)
          ]);
          setAssets(assetItems);
          setPlans(planItems);
          setOwnerInvites(inviteItems);
          setHeirs([]);
        } else {
          const [planItems, heirItems] = await Promise.all([
            listPlans(caseId),
            listCaseHeirs(caseId)
          ]);
          setAssets([]);
          setPlans(planItems);
          setOwnerInvites([]);
          setHeirs(heirItems);
        }
      } catch (err: any) {
        setError(err?.message ?? "ケースの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [caseId, user?.uid]);

  const handleInviteSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!caseId) {
      setError("ケースIDが取得できません");
      return;
    }
    setError(null);
    setInviting(true);
    try {
      await createInvite(caseId, {
        email: inviteEmail,
        relationLabel: inviteRelation,
        relationOther: inviteRelation === "その他" ? inviteRelationOther : undefined,
        memo: inviteMemo.trim() ? inviteMemo : undefined
      });
      setInviteEmail("");
      setInviteRelation(relationOptions[0]);
      setInviteRelationOther("");
      setInviteMemo("");
      const inviteItems = await listInvitesByOwner(caseId);
      setOwnerInvites(inviteItems);
    } catch (err: any) {
      setError(err?.message ?? "招待の送信に失敗しました");
    } finally {
      setInviting(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: "ケース", href: "/cases" },
            { label: title }
          ]}
        />
        <div className={styles.headerRow}>
          <div className={styles.headerMain}>
            <h1 className="text-title">{title}</h1>
            {caseData ? (
              <div className={styles.headerMeta}>
                <span className={styles.statusBadge}>
                  {statusLabels[caseData.stage] ?? caseData.stage}
                </span>
                <span className={styles.metaText}>更新: {formatDate(caseData.updatedAt)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <div className={styles.tabs}>
        <button
          type="button"
          className={tab === "assets" ? styles.tabActive : styles.tab}
          onClick={() => setTab("assets")}
        >
          資産
        </button>
        <button
          type="button"
          className={tab === "plans" ? styles.tabActive : styles.tab}
          onClick={() => setTab("plans")}
        >
          指図
        </button>
        <button
          type="button"
          className={tab === "heirs" ? styles.tabActive : styles.tab}
          onClick={() => setTab("heirs")}
        >
          相続人
        </button>
        <button
          type="button"
          className={tab === "documents" ? styles.tabActive : styles.tab}
          onClick={() => setTab("documents")}
        >
          書類/証跡
        </button>
      </div>

      {tab === "assets" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>資産</h2>
            {caseId && isOwner ? (
              <Button asChild size="sm">
                <Link to={`/cases/${caseId}/assets/new`}>資産を追加</Link>
              </Button>
            ) : null}
          </div>
          {loading ? null : isOwner === false ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>資産は被相続人のみ閲覧できます</div>
              <div className={styles.emptyBody}>
                相続人として参加しているケースでは資産は表示されません。
              </div>
            </div>
          ) : assets.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>まだ資産が登録されていません</div>
              <div className={styles.emptyBody}>「資産を追加」から登録できます。</div>
            </div>
          ) : (
            <div className={styles.list}>
              {assets.map((asset) => (
                <div key={asset.assetId} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{asset.label}</div>
                    <div className={styles.rowMeta}>{asset.address}</div>
                  </div>
                  <div className={styles.rowSide}>{formatDate(asset.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "plans" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>指図</h2>
            {caseId && isOwner ? (
              <Button asChild size="sm">
                <Link to={`/cases/${caseId}/plans/new`}>指図を作成</Link>
              </Button>
            ) : null}
          </div>
          {loading ? null : plans.length === 0 ? (
            <div className={styles.emptyState}>
              {isOwner === false ? (
                <>
                  <div className={styles.emptyTitle}>共有された指図がありません</div>
                  <div className={styles.emptyBody}>
                    共有された指図がある場合はここに表示されます。
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.emptyTitle}>まだ指図がありません</div>
                  <div className={styles.emptyBody}>最初の指図を作成できます。</div>
                </>
              )}
            </div>
          ) : (
            <div className={styles.list}>
              {plans.map((plan) => (
                <Link
                  key={plan.planId}
                  to={`/cases/${caseId}/plans/${plan.planId}`}
                  className={styles.rowLink}
                >
                  <div className={styles.row}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>{plan.title}</div>
                      <div className={styles.rowMeta}>更新: {formatDate(plan.updatedAt)}</div>
                    </div>
                    <div className={styles.rowSide}>
                      <span className={styles.statusBadge}>
                        {plan.status === "SHARED" ? "共有中" : plan.status}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>書類/証跡</h2>
          </div>
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>まだ書類がありません</div>
            <div className={styles.emptyBody}>死亡診断書などの提出がここに表示されます。</div>
          </div>
        </div>
      ) : null}

      {tab === "heirs" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>相続人</h2>
          </div>
          {isOwner ? (
            <form className={styles.form} onSubmit={handleInviteSubmit}>
              <FormField label="メールアドレス">
                <Input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="example@example.com"
                  type="email"
                />
              </FormField>
              <FormField label="関係">
                <select
                  className={styles.select}
                  value={inviteRelation}
                  onChange={(event) => setInviteRelation(event.target.value)}
                >
                  {relationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormField>
              {inviteRelation === "その他" ? (
                <FormField label="関係（自由入力）">
                  <Input
                    value={inviteRelationOther}
                    onChange={(event) => setInviteRelationOther(event.target.value)}
                    placeholder="例: 同居人"
                  />
                </FormField>
              ) : null}
              <FormField label="メモ（任意）">
                <Input
                  value={inviteMemo}
                  onChange={(event) => setInviteMemo(event.target.value)}
                  placeholder="例: 生前からの連絡先"
                />
              </FormField>
              <div className={styles.formActions}>
                <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? "送信中..." : "招待を送る"}
                </Button>
              </div>
            </form>
          ) : null}
          {loading ? null : isOwner ? (
            ownerInvites.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyTitle}>まだ招待がありません</div>
                <div className={styles.emptyBody}>相続人に招待を送信できます。</div>
              </div>
            ) : (
              <div className={styles.list}>
                {ownerInvites.map((invite) => (
                  <div key={invite.inviteId} className={styles.row}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>{invite.email}</div>
                      <div className={styles.rowMeta}>
                        関係:{" "}
                        {invite.relationLabel === "その他"
                          ? invite.relationOther ?? "その他"
                          : invite.relationLabel}
                      </div>
                    </div>
                    <div className={styles.rowSide}>
                      <span className={styles.statusBadge}>
                        {invite.status === "pending"
                          ? "未対応"
                          : invite.status === "accepted"
                            ? "承認済み"
                            : "辞退済み"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : heirs.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>相続人が登録されていません</div>
              <div className={styles.emptyBody}>承認済みの相続人がここに表示されます。</div>
            </div>
          ) : (
            <div className={styles.list}>
              {heirs.map((heir) => (
                <div key={heir.inviteId} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{heir.email}</div>
                    <div className={styles.rowMeta}>
                      関係:{" "}
                      {heir.relationLabel === "その他"
                        ? heir.relationOther ?? "その他"
                        : heir.relationLabel}
                    </div>
                  </div>
                  <div className={styles.rowSide}>
                    <span className={styles.statusBadge}>承認済み</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
