import { useEffect, useState } from "react";
import { listAssets, type AssetListItem } from "../api/assets";
import styles from "../../styles/assetsPage.module.css";
import FormAlert from "../../features/shared/components/form-alert";
import { Button } from "../../features/shared/components/ui/button";
import { Link } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";

const statusLabels: Record<string, string> = {
  UNVERIFIED: "未検証",
  PENDING: "確認中",
  VERIFIED: "確認済み"
};

export default function AssetsPage() {
  const [items, setItems] = useState<AssetListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAssets()
      .then(setItems)
      .catch((err) => {
        if (err?.status === 401 || err?.message === "UNAUTHORIZED") {
          setItems([]);
          return;
        }
        setError(err?.message ?? "取得に失敗しました");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs items={[{ label: "資産一覧" }]} />
        <div className={styles.headerRow}>
          <h1 className="text-title">資産一覧</h1>
          <Button asChild>
            <Link to="/assets/new">追加</Link>
          </Button>
        </div>
      </header>
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {loading ? null : items.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>まだ資産が登録されていません</div>
          <div className={styles.emptyBody}>右上の「追加」から最初の資産を登録できます。</div>
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => (
            <Link key={item.assetId} to={`/assets/${item.assetId}`} className={styles.rowLink}>
              <div className={styles.row}>
                <div>
                  <div className={styles.label}>{item.label}</div>
                  <div className={styles.address}>{item.address}</div>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.statusBadge}>
                    {statusLabels[item.verificationStatus] ?? "未検証"}
                  </span>
                  <span className={styles.meta}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
