import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import { getPlan, type PlanDetail } from "../api/plans";
import styles from "../../styles/caseDetailPage.module.css";

const statusLabels: Record<string, string> = {
  DRAFT: "下書き",
  SHARED: "共有中",
  INACTIVE: "無効"
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "-";
  }
};

export default function CasePlanDetailPage() {
  const { caseId, planId } = useParams();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => plan?.title ?? "指図詳細", [plan]);

  useEffect(() => {
    if (!caseId || !planId) {
      setError("指図IDが取得できません");
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const detail = await getPlan(caseId, planId);
        setPlan(detail);
      } catch (err: any) {
        setError(err?.message ?? "指図の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [caseId, planId]);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: "ケース", href: "/cases" },
            caseId ? { label: "ケース詳細", href: `/cases/${caseId}` } : { label: "ケース詳細" },
            { label: "指図" }
          ]}
        />
        <div className={styles.headerRow}>
          <div className={styles.headerMain}>
            <h1 className="text-title">{title}</h1>
            {plan ? (
              <div className={styles.headerMeta}>
                <span className={styles.statusBadge}>
                  {statusLabels[plan.status] ?? plan.status}
                </span>
                <span className={styles.metaText}>更新: {formatDate(plan.updatedAt)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>概要</h2>
        </div>
        {loading ? null : plan ? (
          <div className={styles.list}>
            <div className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>共有日時</div>
                <div className={styles.rowMeta}>{formatDate(plan.sharedAt)}</div>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>最終更新</div>
                <div className={styles.rowMeta}>{formatDate(plan.updatedAt)}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>指図が見つかりません</div>
            <div className={styles.emptyBody}>アクセス権限を確認してください。</div>
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>共有内容</h2>
        </div>
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>共有された内容は準備中です</div>
          <div className={styles.emptyBody}>資産や分配先の詳細は後続の画面で表示します。</div>
        </div>
      </div>
    </section>
  );
}
