import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import { Button } from "../../features/shared/components/ui/button";
import styles from "../../styles/assetLockPage.module.css";

const steps = [
  { id: "prepare", title: "準備・注意" },
  { id: "method", title: "方式選択" },
  { id: "transfer", title: "送金実行/入力" },
  { id: "verify", title: "送金検証" }
];

export default function AssetLockPage() {
  const { caseId } = useParams();
  const [stepIndex, setStepIndex] = useState(0);
  const current = steps[stepIndex];
  const canBack = stepIndex > 0;
  const canNext = stepIndex < steps.length - 1;

  const stepLabel = useMemo(() => `${stepIndex + 1} / ${steps.length}`, [stepIndex]);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: "ケース", href: "/cases" },
            caseId ? { label: "ケース詳細", href: `/cases/${caseId}` } : { label: "ケース詳細" },
            { label: "資産ロック" }
          ]}
        />
        <div className={styles.headerRow}>
          <div>
            <div className={styles.headerMeta}>資産ロック</div>
            <h1 className="text-title">資産ロックウィザード</h1>
          </div>
          <div className={styles.stepChip}>{stepLabel}</div>
        </div>
      </header>

      <div className={styles.stepCard}>
        <div className={styles.stepTitle}>{current.title}</div>
        <div className={styles.stepBody}>ここに各ステップの内容を表示します。</div>
      </div>

      <div className={styles.stepActions}>
        <Button type="button" variant="ghost" disabled={!canBack} onClick={() => setStepIndex((prev) => prev - 1)}>
          戻る
        </Button>
        <Button type="button" disabled={!canNext} onClick={() => setStepIndex((prev) => prev + 1)}>
          次へ
        </Button>
      </div>
    </section>
  );
}
