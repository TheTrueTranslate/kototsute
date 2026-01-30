import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import { Button } from "../../features/shared/components/ui/button";
import FormField from "../../features/shared/components/form-field";
import FormAlert from "../../features/shared/components/form-alert";
import { Input } from "../../features/shared/components/ui/input";
import {
  executeAssetLock,
  getAssetLock,
  startAssetLock,
  verifyAssetLockItem,
  type AssetLockState
} from "../api/asset-lock";
import styles from "../../styles/assetLockPage.module.css";

const steps = [
  { id: "prepare", title: "準備・注意" },
  { id: "method", title: "方式選択" },
  { id: "transfer", title: "送金実行/入力" },
  { id: "verify", title: "送金検証" }
];

type AssetLockPageProps = {
  initialLock?: AssetLockState | null;
  initialStep?: number;
  initialMethod?: "A" | "B";
};

export default function AssetLockPage({
  initialLock = null,
  initialStep = 0,
  initialMethod = "B"
}: AssetLockPageProps) {
  const { caseId } = useParams();
  const [stepIndex, setStepIndex] = useState(initialStep);
  const [lockState, setLockState] = useState<AssetLockState | null>(initialLock);
  const [method, setMethod] = useState<"A" | "B">(initialMethod);
  const [txInputs, setTxInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = steps[stepIndex];
  const canBack = stepIndex > 0;
  const canNext = stepIndex < steps.length - 1;

  const stepLabel = useMemo(() => `${stepIndex + 1} / ${steps.length}`, [stepIndex]);

  useEffect(() => {
    if (!caseId || initialLock) return;
    setLoading(true);
    setError(null);
    getAssetLock(caseId)
      .then((data) => setLockState(data))
      .catch((err: any) => setError(err?.message ?? "資産ロック情報の取得に失敗しました"))
      .finally(() => setLoading(false));
  }, [caseId, initialLock]);

  const handleStart = async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await startAssetLock(caseId, { method });
      setLockState(data);
      setStepIndex(2);
    } catch (err: any) {
      setError(err?.message ?? "資産ロックの開始に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (itemId: string) => {
    if (!caseId) return;
    const txHash = (txInputs[itemId] ?? "").trim();
    if (!txHash) {
      setError("TX Hashを入力してください");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await verifyAssetLockItem(caseId, { itemId, txHash });
      setLockState(data);
    } catch (err: any) {
      setError(err?.message ?? "送金検証に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await executeAssetLock(caseId);
      setLockState(data);
      setStepIndex(3);
    } catch (err: any) {
      setError(err?.message ?? "自動送金に失敗しました");
    } finally {
      setLoading(false);
    }
  };

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

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <div className={styles.stepCard}>
        <div className={styles.stepTitle}>{current.title}</div>
        {current.id === "prepare" ? (
          <div className={styles.stepBody}>資産・準備金・相続人状況を確認します。</div>
        ) : null}
        {current.id === "method" ? (
          <div className={styles.stepBody}>
            <div className={styles.methodSelect}>
              <label className={styles.methodOption}>
                <input
                  type="radio"
                  name="asset-lock-method"
                  checked={method === "B"}
                  onChange={() => setMethod("B")}
                />
                <span>方式B（自動送金・署名1回）</span>
              </label>
              <label className={styles.methodOption}>
                <input
                  type="radio"
                  name="asset-lock-method"
                  checked={method === "A"}
                  onChange={() => setMethod("A")}
                />
                <span>方式A（手動送金）</span>
              </label>
            </div>
            <div className={styles.methodActions}>
              <Button type="button" onClick={handleStart} disabled={loading}>
                {loading ? "開始中..." : "ロックを開始"}
              </Button>
            </div>
          </div>
        ) : null}
        {current.id === "transfer" ? (
          <div className={styles.stepBody}>
            {method === "B" ? (
              <div className={styles.methodActions}>
                <Button type="button" onClick={handleExecute} disabled={loading}>
                  {loading ? "送金中..." : "自動送金を実行"}
                </Button>
              </div>
            ) : (
              <div className={styles.transferList}>
                {(lockState?.items ?? []).map((item) => (
                  <div key={item.itemId} className={styles.transferRow}>
                    <div>
                      <div className={styles.transferLabel}>{item.assetLabel}</div>
                      <div className={styles.transferMeta}>
                        {item.token ? `${item.token.currency} / ${item.token.issuer ?? ""}` : "XRP"}
                        {" · "}予定 {item.plannedAmount}
                      </div>
                    </div>
                    <FormField label="TX Hash">
                      <Input
                        value={txInputs[item.itemId] ?? ""}
                        onChange={(event) =>
                          setTxInputs((prev) => ({
                            ...prev,
                            [item.itemId]: event.target.value
                          }))
                        }
                      />
                    </FormField>
                    <Button type="button" size="sm" onClick={() => handleVerify(item.itemId)}>
                      検証
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {current.id === "verify" ? (
          <div className={styles.stepBody}>送金検証の結果を表示します。</div>
        ) : null}
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
