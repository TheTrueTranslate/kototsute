import { useEffect, useState } from "react";
import { listAssets, type AssetListItem } from "../api/assets";
import styles from "../../styles/assetsPage.module.css";
import { FormAlert } from "@kototsute/ui";

export default function AssetsPage() {
  const [items, setItems] = useState<AssetListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAssets()
      .then(setItems)
      .catch((err) => setError(err?.message ?? "取得に失敗しました"));
  }, []);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className="text-title">資産一覧</h1>
      </header>
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
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
    </section>
  );
}
