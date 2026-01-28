import { useEffect, useState } from "react";
import { listAssets, type AssetListItem } from "../api/assets";
import styles from "../../styles/assetsPage.module.css";
import { FormAlert, Button } from "@kototsute/ui";
import { Link } from "react-router-dom";

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
        <div className={styles.headerRow}>
          <h1 className="text-title">資産一覧</h1>
          <Button as={Link} to="/assets/new">
            追加
          </Button>
        </div>
      </header>
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {loading ? null : items.length === 0 ? (
        <div className={styles.emptyState}>登録された資産はありません。</div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => (
            <div key={item.assetId} className={styles.row}>
              <div>
                <div className={styles.label}>{item.label}</div>
                <div className={styles.address}>{item.address}</div>
              </div>
              <div className={styles.meta}>{new Date(item.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
