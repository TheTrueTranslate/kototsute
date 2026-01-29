import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listPlans, type PlanListItem } from "../api/plans";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import { Button } from "../../features/shared/components/ui/button";
import FormAlert from "../../features/shared/components/form-alert";
import styles from "../../styles/plansPage.module.css";

const statusLabels: Record<string, string> = {
  DRAFT: "下書き",
  SHARED: "共有中",
  INACTIVE: "無効"
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const loadPlans = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await listPlans();
      setPlans(data);
    } catch (err: any) {
      setError(err?.message ?? "指図の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPlans();
  }, []);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs items={[{ label: "指図一覧" }]} />
        <div className={styles.headerRow}>
          <h1 className="text-title">指図</h1>
          <div className={styles.headerActions}>
            <Button type="button" variant="outline" onClick={loadPlans} disabled={loading}>
              再読み込み
            </Button>
            <Button type="button" onClick={() => navigate("/plans/new")}>新規作成</Button>
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      {plans.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>指図はまだありません</div>
          <p className={styles.emptyBody}>最初の指図を作成して、相続人と共有できます。</p>
          <div className={styles.headerActions}>
            <Button type="button" onClick={() => navigate("/plans/new")}>指図を作成する</Button>
          </div>
        </div>
      ) : (
        <div className={styles.list}>
          {plans.map((plan) => (
            <div key={plan.planId} className={styles.row}>
              <Link to={`/plans/${plan.planId}`} className={styles.rowLink}>
                <div className={styles.rowSide}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{plan.title}</div>
                    <div className={styles.rowMeta}>最終更新: {formatDate(plan.updatedAt)}</div>
                  </div>
                  <div className={styles.inlineRow}>
                    <span className={styles.statusBadge}>{statusLabels[plan.status] ?? plan.status}</span>
                  </div>
                </div>
              </Link>
              <div className={styles.rowMeta}>共有日時: {formatDate(plan.sharedAt)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
