import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import { Button } from "../../features/shared/components/ui/button";
import { getCase, type CaseSummary } from "../api/cases";
import { listAssets, type AssetListItem } from "../api/assets";
import { listPlans, type PlanListItem } from "../api/plans";
import { useAuth } from "../../features/auth/auth-provider";
import styles from "../../styles/caseDetailPage.module.css";

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

type TabKey = "assets" | "plans" | "documents";

export default function CaseDetailPage() {
  const { caseId } = useParams();
  const { user } = useAuth();
  const [caseData, setCaseData] = useState<CaseSummary | null>(null);
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [plans, setPlans] = useState<PlanListItem[]>([]);
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
          const [assetItems, planItems] = await Promise.all([
            listAssets(caseId),
            listPlans(caseId)
          ]);
          setAssets(assetItems);
          setPlans(planItems);
        } else {
          const planItems = await listPlans(caseId);
          setAssets([]);
          setPlans(planItems);
        }
      } catch (err: any) {
        setError(err?.message ?? "ケースの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [caseId, user?.uid]);

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
    </section>
  );
}
