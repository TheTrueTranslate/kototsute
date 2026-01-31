import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import { useAuth } from "../../features/auth/auth-provider";
import { Button } from "../../features/shared/components/ui/button";
import FormField from "../../features/shared/components/form-field";
import FormAlert from "../../features/shared/components/form-alert";
import { Input } from "../../features/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "../../features/shared/components/ui/dialog";
import { syncAssetLockStep } from "../../features/asset-lock/asset-lock-step-sync";
import { resolveAssetLockStepIndex } from "../../features/asset-lock/asset-lock-step-utils";
import {
  resolveStartStepIndex,
  shouldStartAssetLock
} from "../../features/asset-lock/asset-lock-start";
import {
  completeAssetLock,
  executeAssetLock,
  getAssetLockBalances,
  getAssetLock,
  startAssetLock,
  verifyAssetLockRegularKey,
  updateAssetLockState,
  verifyAssetLockItem,
  type AssetLockBalances,
  type AssetLockState
} from "../api/asset-lock";
import { getCase, type CaseSummary } from "../api/cases";
import { getPlan, listPlanAssets, listPlans, type PlanAsset, type PlanHeir, type PlanListItem } from "../api/plans";
import { Copy } from "lucide-react";
import { copyText } from "../../features/shared/lib/copy-text";
import styles from "../../styles/assetLockPage.module.css";

const XRPL_EXPLORER_BASE = "https://testnet.xrpl.org/accounts";

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
  initialPlans?: PlanListItem[];
  initialPlanAssets?: Record<string, PlanAsset[]>;
  initialPlanHeirs?: Record<string, PlanHeir[]>;
  initialIsOwner?: boolean | null;
  initialCaseData?: CaseSummary | null;
  initialAutoTransferConfirmOpen?: boolean;
  initialBalances?: AssetLockBalances | null;
};

export default function AssetLockPage({
  initialLock = null,
  initialStep = 0,
  initialMethod = "B",
  initialPlans,
  initialPlanAssets,
  initialPlanHeirs,
  initialIsOwner = null,
  initialCaseData = null,
  initialAutoTransferConfirmOpen,
  initialBalances = null
}: AssetLockPageProps) {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stepIndex, setStepIndex] = useState(() =>
    resolveAssetLockStepIndex(initialLock?.uiStep, initialStep)
  );
  const [lockState, setLockState] = useState<AssetLockState | null>(initialLock);
  const [method, setMethod] = useState<"A" | "B">(initialLock?.method ?? initialMethod);
  const [caseData, setCaseData] = useState<CaseSummary | null>(initialCaseData);
  const [isOwner, setIsOwner] = useState<boolean | null>(() => {
    if (typeof initialIsOwner === "boolean") return initialIsOwner;
    if (initialCaseData && user?.uid) {
      return initialCaseData.ownerUid === user.uid;
    }
    return null;
  });
  const [plans, setPlans] = useState<PlanListItem[]>(() => initialPlans ?? []);
  const [planAssetsById, setPlanAssetsById] = useState<Record<string, PlanAsset[]>>(
    () => initialPlanAssets ?? {}
  );
  const [planHeirsById, setPlanHeirsById] = useState<Record<string, PlanHeir[]>>(
    () => initialPlanHeirs ?? {}
  );
  const [planLoading, setPlanLoading] = useState(!initialPlans);
  const [planError, setPlanError] = useState<string | null>(null);
  const [txInputs, setTxInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regularKeyOpen, setRegularKeyOpen] = useState(false);
  const [regularKeyError, setRegularKeyError] = useState<string | null>(null);
  const [regularKeyLoading, setRegularKeyLoading] = useState(false);
  const [autoTransferConfirmOpen, setAutoTransferConfirmOpen] = useState(
    initialAutoTransferConfirmOpen ?? false
  );
  const [balances, setBalances] = useState<AssetLockBalances | null>(initialBalances);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [redirectSeconds, setRedirectSeconds] = useState<number | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const prevUiStepRef = useRef<number | null>(null);
  const current = steps[stepIndex];
  const methodSteps = [
    {
      id: "REGULAR_KEY_SET",
      title: "RegularKeyを設定",
      description: "被相続人の署名でRegularKeyを付与します。"
    },
    {
      id: "AUTO_TRANSFER",
      title: "自動送金を実行",
      description: "サーバーが分配用Walletへ送金します。"
    },
    {
      id: "TRANSFER_DONE",
      title: "送金完了を確認",
      description: "送金結果をチェックして反映します。"
    },
    {
      id: "REGULAR_KEY_CLEARED",
      title: "RegularKeyを解除",
      description: "安全のためRegularKeyを解除します。"
    }
  ] as const;

  const stepLabel = useMemo(() => `${stepIndex + 1} / ${steps.length}`, [stepIndex]);
  const regularKeyStatuses = lockState?.regularKeyStatuses ?? [];
  const hideBackButton =
    lockState?.method === "B" &&
    (lockState?.methodStep === "TRANSFER_DONE" ||
      lockState?.methodStep === "REGULAR_KEY_CLEARED");
  const isLocked = lockState?.status === "LOCKED";
  const canComplete =
    (lockState?.items ?? []).length > 0 &&
    (lockState?.items ?? []).every((item) => item.status === "VERIFIED");

  const formatBalanceLabel = (entry: {
    status: "ok" | "error";
    balanceXrp: string | null;
  }) => {
    if (entry.status !== "ok" || !entry.balanceXrp) return "-";
    return `${entry.balanceXrp} XRP`;
  };

  const formatBalanceError = (message: string | null) => {
    if (!message) return null;
    if (/account not found/i.test(message)) {
      return "反映待ち（口座の反映に時間がかかっています）";
    }
    return message;
  };

  const buildExplorerUrl = (address: string) => `${XRPL_EXPLORER_BASE}/${address}`;

  const loadBalances = async () => {
    if (!caseId) return;
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const data = await getAssetLockBalances(caseId);
      setBalances(data);
    } catch (err: any) {
      setBalanceError(err?.message ?? "残高の取得に失敗しました");
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    if (!caseId || initialLock) return;
    setLoading(true);
    setError(null);
    getAssetLock(caseId)
      .then((data) => setLockState(data))
      .catch((err: any) => setError(err?.message ?? "資産ロック情報の取得に失敗しました"))
      .finally(() => setLoading(false));
  }, [caseId, initialLock]);

  useEffect(() => {
    if (!caseId || current?.id !== "verify") return;
    loadBalances();
  }, [caseId, current?.id]);

  useEffect(() => {
    if (!caseId || !isLocked) {
      setRedirectSeconds(null);
      return;
    }
    setRedirectSeconds(5);
    const endAt = Date.now() + 5000;
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRedirectSeconds(remaining);
    }, 1000);
    const timeout = window.setTimeout(() => {
      navigate(`/cases/${caseId}`);
    }, 5000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [caseId, isLocked, navigate]);

  useEffect(() => {
    if (!caseId || initialCaseData) return;
    let active = true;
    getCase(caseId)
      .then((data) => {
        if (!active) return;
        setCaseData(data);
        if (user?.uid) {
          setIsOwner(data.ownerUid === user.uid);
        }
      })
      .catch(() => {
        if (!active) return;
        setCaseData(null);
      });
    return () => {
      active = false;
    };
  }, [caseId, initialCaseData, user?.uid]);

  useEffect(() => {
    if (!caseId || initialPlans) return;
    let active = true;
    setPlanLoading(true);
    setPlanError(null);
    listPlans(caseId)
      .then((data) => {
        if (!active) return;
        setPlans(data);
      })
      .catch((err: any) => {
        if (!active) return;
        setPlanError(err?.message ?? "指図の取得に失敗しました");
      })
      .finally(() => {
        if (!active) return;
        setPlanLoading(false);
      });
    return () => {
      active = false;
    };
  }, [caseId, initialPlans]);

  useEffect(() => {
    if (!caseId || !plans.length) return;
    let active = true;
    const missingAssetPlans = plans.filter((plan) => !planAssetsById[plan.planId]);
    const missingHeirPlans = plans.filter((plan) => !planHeirsById[plan.planId]);
    if (missingAssetPlans.length === 0 && missingHeirPlans.length === 0) return;
    setPlanLoading(true);
    setPlanError(null);
    Promise.all(
      plans.map(async (plan) => {
        const [assets, detail] = await Promise.all([
          planAssetsById[plan.planId]
            ? Promise.resolve(null)
            : listPlanAssets(caseId, plan.planId).catch(() => null),
          planHeirsById[plan.planId] ? Promise.resolve(null) : getPlan(caseId, plan.planId).catch(() => null)
        ]);
        if (!active) return;
        if (assets) {
          setPlanAssetsById((prev) => ({ ...prev, [plan.planId]: assets }));
        }
        if (detail?.heirs) {
          setPlanHeirsById((prev) => ({ ...prev, [plan.planId]: detail.heirs }));
        }
      })
    )
      .catch((err: any) => {
        if (!active) return;
        setPlanError(err?.message ?? "指図の取得に失敗しました");
      })
      .finally(() => {
        if (!active) return;
        setPlanLoading(false);
      });
    return () => {
      active = false;
    };
  }, [caseId, plans, planAssetsById, planHeirsById]);

  useEffect(() => {
    if (!lockState?.method) return;
    setMethod(lockState.method);
  }, [lockState?.method]);

  useEffect(() => {
    if (typeof lockState?.uiStep !== "number") return;
    if (prevUiStepRef.current === lockState.uiStep) return;
    prevUiStepRef.current = lockState.uiStep;
    const nextIndex = resolveAssetLockStepIndex(lockState.uiStep, stepIndex);
    if (nextIndex !== stepIndex) {
      setStepIndex(nextIndex);
    }
  }, [lockState?.uiStep, stepIndex]);

  useEffect(() => {
    if (!caseData || !user?.uid || typeof initialIsOwner === "boolean") return;
    setIsOwner(caseData.ownerUid === user.uid);
  }, [caseData, user?.uid, initialIsOwner]);

  const renderHeirLabel = (heir?: PlanHeir | null, isUnallocated?: boolean) => {
    if (isUnallocated) return "未割当";
    if (!heir) return "相続人";
    if (heir.relationLabel === "その他") return heir.relationOther ?? "その他";
    return heir.relationLabel || heir.email || "相続人";
  };

  const formatAllocationValue = (value: number, unitType: "PERCENT" | "AMOUNT") => {
    if (unitType === "PERCENT") return `${value}%`;
    return `${value}`;
  };

  const formatRegularKeyStatus = (status: "VERIFIED" | "UNVERIFIED" | "ERROR") => {
    if (status === "VERIFIED") return "確認済み";
    if (status === "ERROR") return "エラー";
    return "未確認";
  };

  const formatItemStatus = (status: AssetLockState["items"][number]["status"]) => {
    if (status === "VERIFIED") return "確認済み";
    if (status === "FAILED") return "失敗";
    if (status === "SENT") return "送金済み";
    return "未検証";
  };

  const getItemStatusClass = (status: AssetLockState["items"][number]["status"]) => {
    if (status === "VERIFIED") return styles.statusSuccess;
    if (status === "FAILED") return styles.statusError;
    if (status === "SENT") return styles.statusInfo;
    return styles.statusPending;
  };

  const getRegularKeySummary = (
    statuses: {
      status: "VERIFIED" | "UNVERIFIED" | "ERROR";
    }[]
  ) => {
    if (!statuses.length) return "未確認";
    if (statuses.some((status) => status.status === "ERROR")) return "エラー";
    if (statuses.every((status) => status.status === "VERIFIED")) return "確認済み";
    return "未確認";
  };

  const handleStart = async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const shouldStart = shouldStartAssetLock(method, lockState ?? null);
      const data = shouldStart
        ? await startAssetLock(caseId, { method })
        : lockState ?? (await startAssetLock(caseId, { method }));
      setLockState(data);
      const nextIndex = resolveStartStepIndex(data, 2);
      setStepIndex(nextIndex);
      const synced = await syncAssetLockStep(caseId, nextIndex);
      if (synced) {
        setLockState(synced);
      }
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
      const nextIndex = resolveAssetLockStepIndex(data.uiStep, 3);
      setStepIndex(nextIndex);
      const synced = await syncAssetLockStep(caseId, nextIndex);
      if (synced) {
        setLockState(synced);
      }
    } catch (err: any) {
      setError(err?.message ?? "自動送金に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!caseId) return;
    setCompleteLoading(true);
    setError(null);
    try {
      const data = await completeAssetLock(caseId);
      setLockState(data);
    } catch (err: any) {
      setError(err?.message ?? "資産ロックの完了に失敗しました");
    } finally {
      setCompleteLoading(false);
    }
  };

  const handleConfirmAutoTransfer = async () => {
    setAutoTransferConfirmOpen(false);
    await handleExecute();
  };

  const handleReturnToRegularKey = async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await updateAssetLockState(caseId, { methodStep: "REGULAR_KEY_SET" });
      setLockState(data);
    } catch (err: any) {
      setError(err?.message ?? "RegularKeyの確認に戻れませんでした");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPreparation = async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const nextIndex = 1;
      const data = await syncAssetLockStep(caseId, nextIndex);
      if (data) {
        setLockState(data);
      }
      setStepIndex(nextIndex);
    } catch (err: any) {
      setError(err?.message ?? "確認の記録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (label: string, value: string) => {
    const result = await copyText(label, value);
    setCopyMessage(result.message);
  };

  const handleConfirmRegularKey = async () => {
    if (!caseId) return;
    setRegularKeyLoading(true);
    setRegularKeyError(null);
    try {
      const data = await verifyAssetLockRegularKey(caseId);
      setLockState(data);
      setRegularKeyOpen(false);
    } catch (err: any) {
      setRegularKeyError(err?.message ?? "RegularKeyの確認に失敗しました");
    } finally {
      setRegularKeyLoading(false);
    }
  };

  const handleBack = async () => {
    const nextIndex = Math.max(0, stepIndex - 1);
    setStepIndex(nextIndex);
    if (!caseId) return;
    try {
      const data = await syncAssetLockStep(caseId, nextIndex);
      if (data) {
        setLockState(data);
      }
    } catch (err: any) {
      setError(err?.message ?? "ステップの更新に失敗しました");
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
            <h1 className="text-title">資産ロック手続き</h1>
          </div>
          <div className={styles.stepChip}>
            <span className={styles.stepChipLabel}>STEP</span>
            <span className={styles.stepChipValue}>{stepLabel}</span>
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {isLocked ? (
        <FormAlert variant="success">
          資産ロックが完了しました。{redirectSeconds ?? 5}秒でケース詳細に戻ります。
        </FormAlert>
      ) : null}

      <div className={styles.stepCard}>
        <div className={styles.stepTitle}>{current.title}</div>
        {current.id === "prepare" ? (
          <div className={styles.stepBody}>
            <div>資産・準備金・相続人状況を確認します。</div>
            <div className={styles.planSection}>
              <div className={styles.planSectionTitle}>指図プレビュー</div>
              {planLoading ? (
                <div className={styles.planHint}>読み込み中...</div>
              ) : planError ? (
                <div className={styles.planHint}>{planError}</div>
              ) : plans.length === 0 ? (
                <div className={styles.planHint}>指図がありません</div>
              ) : (
                <div className={styles.planList}>
                  {plans.map((plan) => (
                    <div key={plan.planId} className={styles.planCard}>
                      <div className={styles.planTitle}>{plan.title}</div>
                      <div className={styles.planMeta}>
                        {plan.status === "SHARED"
                          ? "共有中"
                          : plan.status === "INACTIVE"
                          ? "停止中"
                          : "下書き"}
                      </div>
                      <div className={styles.planRuleTitle}>分配ルール</div>
                      {planAssetsById[plan.planId] ? (
                        planAssetsById[plan.planId].length === 0 ? (
                          <div className={styles.planHint}>分配ルールが未設定です</div>
                        ) : (
                          <div className={styles.ruleList}>
                            {planAssetsById[plan.planId].map((asset) => {
                              const heirs = planHeirsById[plan.planId] ?? [];
                              return (
                                <div key={asset.planAssetId} className={styles.ruleItem}>
                                  <div className={styles.ruleHeader}>
                                    <span className={styles.ruleAsset}>{asset.assetLabel}</span>
                                    <span className={styles.ruleUnit}>
                                      {asset.unitType === "PERCENT" ? "割合" : "数量"}
                                    </span>
                                  </div>
                                  {asset.allocations?.length ? (
                                    <div className={styles.ruleAllocations}>
                                      {asset.allocations.map((allocation, index) => {
                                        const heir = heirs.find((item) => item.uid === allocation.heirUid) ?? null;
                                        return (
                                          <div key={`${asset.planAssetId}-${index}`} className={styles.ruleRow}>
                                            <span className={styles.ruleHeir}>
                                              {renderHeirLabel(heir, allocation.isUnallocated)}
                                            </span>
                                            <span className={styles.ruleValue}>
                                              {formatAllocationValue(allocation.value, asset.unitType)}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className={styles.planHint}>配分が未設定です</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )
                      ) : (
                        <div className={styles.planHint}>分配ルールを読み込み中...</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {isOwner === true ? (
              <div className={styles.methodActions}>
                <Button type="button" onClick={handleConfirmPreparation} disabled={loading}>
                  {loading ? "記録中..." : "確認しました"}
                </Button>
              </div>
            ) : (
              <div className={styles.planHint}>被相続人の確認待ちです。</div>
            )}
          </div>
        ) : null}
        {current.id === "method" ? (
          <div className={styles.stepBody}>
            <div className={styles.methodSelect}>
              <label
                className={`${styles.methodCard} ${method === "A" ? styles.methodCardActive : ""}`}
              >
                <div className={styles.methodHeader}>
                  <input
                    type="radio"
                    name="asset-lock-method"
                    checked={method === "A"}
                    onChange={() => setMethod("A")}
                    className={styles.methodRadio}
                  />
                  <div className={styles.methodHeading}>
                    <div className={styles.methodTitle}>方式A（手動送金）</div>
                    <div className={styles.methodSummary}>
                      ご自身のWalletから分配用Walletへ送金します。
                    </div>
                  </div>
                </div>
                <ul className={styles.methodList}>
                  <li className={styles.methodListItem}>送金後にTX Hashを入力して検証します</li>
                  <li className={styles.methodListItem}>資産ごとに送金作業が必要です</li>
                  <li className={styles.methodListItem}>署名回数が増えます</li>
                </ul>
              </label>
              <label
                className={`${styles.methodCard} ${method === "B" ? styles.methodCardActive : ""}`}
              >
                <div className={styles.methodHeader}>
                  <input
                    type="radio"
                    name="asset-lock-method"
                    checked={method === "B"}
                    onChange={() => setMethod("B")}
                    className={styles.methodRadio}
                  />
                  <div className={styles.methodHeading}>
                    <div className={styles.methodTitleRow}>
                      <span className={styles.methodTitle}>方式B（自動送金・署名1回）</span>
                      <span className={styles.methodBadge}>おすすめ</span>
                    </div>
                    <div className={styles.methodSummary}>
                      一時的にRegularKeyを付与し、分配用Walletへ自動送金します。
                    </div>
                  </div>
                </div>
                <ul className={styles.methodList}>
                  <li className={styles.methodListItem}>署名は1回だけで完了します</li>
                  <li className={styles.methodListItem}>手順が少なくミスが起きにくいです</li>
                  <li className={styles.methodListItem}>
                    おすすめ: 方式Bは短時間でロックまで進められます
                  </li>
                </ul>
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
            <div className={styles.transferHint}>
              方式Aは手動送金/検証、方式Bは自動送金（RegularKey確認後）です。
            </div>
            {method === "B" ? (
              <div className={styles.methodProgress}>
                {methodSteps.map((step, index) => {
                  const currentIndex = methodSteps.findIndex(
                    (item) => item.id === (lockState?.methodStep ?? "")
                  );
                  const status =
                    currentIndex === -1
                      ? "pending"
                      : index < currentIndex
                      ? "done"
                      : index === currentIndex
                      ? "current"
                      : "pending";
                  const statusClass =
                    status === "done"
                      ? styles.methodStepDone
                      : status === "current"
                      ? styles.methodStepCurrent
                      : styles.methodStepPending;
                  return (
                    <div key={step.id} className={`${styles.methodStep} ${statusClass}`}>
                      <div className={styles.methodStepIndicator}>
                        {status === "done" ? "✓" : index + 1}
                      </div>
                      <div className={styles.methodStepContent}>
                        <div className={styles.methodStepTitle}>{step.title}</div>
                        <div className={styles.methodStepDescription}>{step.description}</div>
                        {status === "current" ? (
                          <span className={styles.methodStepTag}>進行中</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {lockState?.methodStep === "REGULAR_KEY_SET" ? (
                  <div className={styles.regularKeyCard}>
                    <div className={styles.regularKeyTitle}>RegularKeyの署名</div>
                    <div className={styles.regularKeyBody}>
                      被相続人のウォレットでRegularKeyを設定し、署名後に確認します。
                    </div>
                    <div className={styles.regularKeySummary}>
                      <span className={styles.regularKeySummaryLabel}>確認状況</span>
                      <span className={styles.regularKeySummaryValue}>
                        {getRegularKeySummary(regularKeyStatuses)}
                      </span>
                    </div>
                    <div className={styles.regularKeyNote}>
                      確認が完了するまで次へ進めません。
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRegularKeyOpen(true)}
                    >
                      確認する
                    </Button>
                  </div>
                ) : null}
                {regularKeyStatuses.length > 0 ? (
                  <div className={styles.regularKeyStatusCard}>
                    <div className={styles.regularKeyStatusTitle}>RegularKeyの確認結果</div>
                    <div className={styles.regularKeyStatusList}>
                      {regularKeyStatuses.map((status) => (
                        <div
                          key={`${status.assetId}-${status.address}`}
                          className={styles.regularKeyStatusItem}
                        >
                          <div className={styles.regularKeyStatusRow}>
                            <div className={styles.regularKeyStatusLabel}>
                              {status.assetLabel || status.address}
                            </div>
                            <div className={styles.regularKeyStatusValue}>
                              {formatRegularKeyStatus(status.status)}
                            </div>
                          </div>
                          {status.message ? (
                            <div className={styles.regularKeyStatusMessage}>{status.message}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {lockState?.methodStep === "AUTO_TRANSFER" ? (
                  <div className={styles.methodActions}>
                    <div className={styles.autoTransferNote}>
                      自動送金を実行すると戻れません
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReturnToRegularKey}
                      disabled={loading}
                    >
                      RegularKeyに戻る
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setAutoTransferConfirmOpen(true)}
                      disabled={loading}
                    >
                      {loading ? "送金中..." : "自動送金を実行"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={styles.transferList}>
                {(lockState?.items ?? []).length === 0 ? (
                  <div className={styles.emptyState}>送金対象がありません</div>
                ) : (
                  (lockState?.items ?? []).map((item) => (
                    <div key={item.itemId} className={styles.transferRow}>
                      <div>
                        <div className={styles.transferLabel}>{item.assetLabel}</div>
                        <div className={styles.transferType}>
                          {item.token ? "トークン送金" : "XRP送金"}
                        </div>
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
                  ))
                )}
              </div>
            )}
          </div>
        ) : null}
        {current.id === "verify" ? (
          <div className={styles.stepBody}>
            <div className={styles.verifyTitle}>送金検証の結果</div>
            <div className={styles.balanceBlock}>
              <div className={styles.balanceHeader}>
                <div className={styles.balanceTitle}>ウォレット残高 (XRP)</div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={loadBalances}
                  disabled={balanceLoading}
                >
                  再取得
                </Button>
              </div>
              <div className={styles.balanceNote}>
                反映に時間がかかる場合があります。必要に応じて再取得してください。
              </div>
              {balanceError ? <FormAlert variant="error">{balanceError}</FormAlert> : null}
              {balanceLoading ? (
                <div className={styles.balanceNote}>残高を取得中...</div>
              ) : null}
              {balances ? (
                <div className={styles.balanceGrid}>
                  <div className={styles.balanceItem}>
                    <div className={styles.balanceLabel}>送金先</div>
                    <div className={styles.balanceValue}>
                      {formatBalanceLabel(balances.destination)}
                    </div>
                    <a
                      className={styles.balanceLink}
                      href={buildExplorerUrl(balances.destination.address)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {balances.destination.address}
                    </a>
                    {balances.destination.status === "error" &&
                    formatBalanceError(balances.destination.message) ? (
                      <div className={styles.balanceError}>
                        {formatBalanceError(balances.destination.message)}
                      </div>
                    ) : null}
                  </div>
                  {balances.sources.map((source) => (
                    <div key={source.assetId ?? source.address} className={styles.balanceItem}>
                      <div className={styles.balanceLabel}>
                        送金元{source.assetLabel ? ` (${source.assetLabel})` : ""}
                      </div>
                      <div className={styles.balanceValue}>
                        {formatBalanceLabel(source)}
                      </div>
                      <a
                        className={styles.balanceLink}
                        href={buildExplorerUrl(source.address)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.address}
                      </a>
                      {source.status === "error" && formatBalanceError(source.message) ? (
                        <div className={styles.balanceError}>
                          {formatBalanceError(source.message)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {(lockState?.items ?? []).length === 0 ? (
              <div className={styles.emptyState}>送金検証の結果がありません</div>
            ) : (
              <div className={styles.transferList}>
                {(lockState?.items ?? []).map((item) => (
                  <div key={item.itemId} className={styles.transferRow}>
                    <div className={styles.transferHeader}>
                      <div className={styles.transferLabel}>{item.assetLabel}</div>
                      <span
                        className={`${styles.statusBadge} ${getItemStatusClass(item.status)}`}
                      >
                        {formatItemStatus(item.status)}
                      </span>
                    </div>
                    <div className={styles.transferType}>
                      {item.token ? "トークン送金" : "XRP送金"}
                    </div>
                    <div className={styles.transferMeta}>予定 {item.plannedAmount}</div>
                    {item.txHash ? (
                      <div className={styles.transferMeta}>TX Hash: {item.txHash}</div>
                    ) : null}
                    {item.error ? (
                      <div className={styles.statusErrorText}>{item.error}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            <div className={styles.methodActions}>
              <Button
                type="button"
                onClick={handleComplete}
                disabled={!canComplete || completeLoading || isLocked}
              >
                {isLocked ? "完了済み" : completeLoading ? "完了中..." : "完了する"}
              </Button>
            </div>
          </div>
        ) : null}
        {stepIndex > 0 && !hideBackButton ? (
          <div className={styles.stepActions}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBack}
              className={styles.backButton}
              data-variant="back"
            >
              戻る
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog open={regularKeyOpen} onOpenChange={setRegularKeyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>RegularKeyを設定</DialogTitle>
            <DialogDescription>
              ウォレットアプリでAccountSetを実行し、RegularKeyに分配用Walletを指定してください。
            </DialogDescription>
          </DialogHeader>
          {regularKeyError ? <FormAlert variant="error">{regularKeyError}</FormAlert> : null}
          {copyMessage ? <FormAlert variant="info">{copyMessage}</FormAlert> : null}
          <div className={styles.regularKeyInfo}>
            <div className={styles.regularKeyRow}>
              <div>
                <div className={styles.regularKeyLabel}>RegularKeyアドレス</div>
                <div className={styles.regularKeyValue}>
                  {lockState?.wallet?.address ?? "未発行"}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className={styles.copyButton}
                onClick={() => handleCopy("RegularKey", lockState?.wallet?.address ?? "")}
                aria-label="RegularKeyアドレスをコピー"
              >
                <Copy />
              </Button>
            </div>
          </div>
          <div className={styles.methodActions}>
            <Button type="button" onClick={handleConfirmRegularKey} disabled={regularKeyLoading}>
              {regularKeyLoading ? "記録中..." : "確認する"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={autoTransferConfirmOpen} onOpenChange={setAutoTransferConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>自動送金を実行します</DialogTitle>
            <DialogDescription>
              自動送金を実行すると戻れません。内容を確認のうえ実行してください。
            </DialogDescription>
          </DialogHeader>
          <div className={styles.methodActions}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAutoTransferConfirmOpen(false)}
            >
              キャンセル
            </Button>
            <Button type="button" onClick={handleConfirmAutoTransfer} disabled={loading}>
              {loading ? "送金中..." : "実行する"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </section>
  );
}
