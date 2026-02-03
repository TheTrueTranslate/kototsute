import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { createPaymentTx, signSingle, submitSignedBlob } from "../../features/xrpl/xrpl-client";
import { getRelationOptionKey, relationOtherValue } from "@kototsute/shared";
import styles from "../../styles/assetLockPage.module.css";

const XRPL_EXPLORER_BASE = "https://testnet.xrpl.org/accounts";

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
  const { t } = useTranslation();
  const steps = [
    { id: "prepare", title: t("assetLock.steps.prepare") },
    { id: "method", title: t("assetLock.steps.method") },
    { id: "transfer", title: t("assetLock.steps.transfer") },
    { id: "verify", title: t("assetLock.steps.verify") }
  ];
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
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferDialogItem, setTransferDialogItem] = useState<
    AssetLockState["items"][number] | null
  >(null);
  const [transferFromAddress, setTransferFromAddress] = useState("");
  const [transferSecret, setTransferSecret] = useState("");
  const [transferSending, setTransferSending] = useState(false);
  const [transferSendError, setTransferSendError] = useState<string | null>(null);
  const [transferSendSuccess, setTransferSendSuccess] = useState<string | null>(null);
  const prevUiStepRef = useRef<number | null>(null);
  const current = steps[stepIndex];
  const methodSteps = [
    {
      id: "REGULAR_KEY_SET",
      title: t("assetLock.methodSteps.regularKeySet.title"),
      description: t("assetLock.methodSteps.regularKeySet.description")
    },
    {
      id: "AUTO_TRANSFER",
      title: t("assetLock.methodSteps.autoTransfer.title"),
      description: t("assetLock.methodSteps.autoTransfer.description")
    },
    {
      id: "TRANSFER_DONE",
      title: t("assetLock.methodSteps.transferDone.title"),
      description: t("assetLock.methodSteps.transferDone.description")
    },
    {
      id: "REGULAR_KEY_CLEARED",
      title: t("assetLock.methodSteps.regularKeyCleared.title"),
      description: t("assetLock.methodSteps.regularKeyCleared.description")
    }
  ] as const;

  const assetAddressMap = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(planAssetsById).forEach((assets) => {
      (assets ?? []).forEach((asset) => {
        if (asset.assetId && asset.assetAddress) {
          map.set(asset.assetId, asset.assetAddress);
        }
      });
    });
    return map;
  }, [planAssetsById]);

  const resolveAssetAddress = (assetId: string) => assetAddressMap.get(assetId) ?? "";

  const stepLabel = `${stepIndex + 1} / ${steps.length}`;
  const regularKeyStatuses = lockState?.regularKeyStatuses ?? [];
  const hideBackButton =
    lockState?.method === "B" &&
    (lockState?.methodStep === "TRANSFER_DONE" ||
      lockState?.methodStep === "REGULAR_KEY_CLEARED");
  const isLocked = lockState?.status === "LOCKED";
  const canComplete =
    (lockState?.items ?? []).length > 0 &&
    (lockState?.items ?? []).every((item) => item.status === "VERIFIED");
  const activePlans = useMemo(
    () => plans.filter((plan) => plan.status !== "INACTIVE"),
    [plans]
  );
  const isPlanDataReady =
    !planLoading &&
    activePlans.every((plan) => planHeirsById[plan.planId] !== undefined);
  const planValidationError = useMemo(() => {
    if (!isPlanDataReady) return null;
    if (activePlans.length === 0) return "assetLock.validation.noPlans";
    const hasMissingHeirs = activePlans.some(
      (plan) => (planHeirsById[plan.planId]?.length ?? 0) === 0
    );
    if (hasMissingHeirs) return "assetLock.validation.missingHeirs";
    return null;
  }, [activePlans, isPlanDataReady, planHeirsById]);

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
      return t("assetLock.validation.pendingSync");
    }
    return message;
  };

  const buildExplorerUrl = (address: string) => `${XRPL_EXPLORER_BASE}/${address}`;

  const handleOpenTransferDialog = (item: AssetLockState["items"][number]) => {
    setTransferDialogItem(item);
    setTransferFromAddress(resolveAssetAddress(item.assetId));
    setTransferSecret("");
    setTransferSendError(null);
    setTransferSendSuccess(null);
    setTransferDialogOpen(true);
  };

  const handleSendTransfer = async () => {
    if (!transferDialogItem) return;
    const destination = lockState?.wallet?.address ?? "";
    if (!destination) {
      setTransferSendError("assetLock.transfer.errors.destinationMissing");
      return;
    }
    const from = transferFromAddress.trim();
    if (!from) {
      setTransferSendError("assetLock.transfer.errors.fromMissing");
      return;
    }
    const secret = transferSecret.trim();
    if (!secret) {
      setTransferSendError("assetLock.transfer.errors.secretMissing");
      return;
    }
    const token = transferDialogItem.token;
    if (token && !token.issuer) {
      setTransferSendError("assetLock.transfer.errors.issuerMissing");
      return;
    }
    const amount = token
      ? {
          currency: token.currency,
          issuer: token.issuer ?? "",
          value: String(transferDialogItem.plannedAmount ?? "0")
        }
      : String(transferDialogItem.plannedAmount ?? "0");

    setTransferSending(true);
    setTransferSendError(null);
    setTransferSendSuccess(null);
    try {
      const tx = await createPaymentTx({ from, to: destination, amount });
      const signed = signSingle(tx, secret);
      const result = await submitSignedBlob(signed.blob);
      setTxInputs((prev) => ({
        ...prev,
        [transferDialogItem.itemId]: result.txHash
      }));
      setTransferSendSuccess("assetLock.transfer.success.sent");
      setTransferSecret("");
    } catch (err: any) {
      setTransferSendError(err?.message ?? "assetLock.transfer.errors.sendFailed");
    } finally {
      setTransferSending(false);
    }
  };

  const loadBalances = async () => {
    if (!caseId) return;
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const data = await getAssetLockBalances(caseId);
      setBalances(data);
    } catch (err: any) {
      setBalanceError(err?.message ?? "assetLock.error.balanceFetch");
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
      .catch((err: any) => setError(err?.message ?? "assetLock.error.lockFetch"))
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
        setPlanError(err?.message ?? "assetLock.error.planFetch");
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
        setPlanError(err?.message ?? "assetLock.error.planFetch");
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
    if (isUnallocated) return t("assetLock.heir.unassigned");
    if (!heir) return t("assetLock.heir.defaultLabel");
    if (heir.relationLabel === relationOtherValue) {
      return heir.relationOther?.trim() ? heir.relationOther : t("relations.other");
    }
    const relationKey = getRelationOptionKey(heir.relationLabel);
    if (relationKey) return t(relationKey);
    return heir.relationLabel || heir.email || t("assetLock.heir.defaultLabel");
  };

  const formatAllocationValue = (value: number, unitType: "PERCENT" | "AMOUNT") => {
    if (unitType === "PERCENT") return `${value}%`;
    return `${value}`;
  };

  const formatRegularKeyStatus = (status: "VERIFIED" | "UNVERIFIED" | "ERROR") => {
    if (status === "VERIFIED") return t("assetLock.status.regularKey.verified");
    if (status === "ERROR") return t("assetLock.status.regularKey.error");
    return t("assetLock.status.regularKey.unverified");
  };

  const formatItemStatus = (status: AssetLockState["items"][number]["status"]) => {
    if (status === "VERIFIED") return t("assetLock.status.item.verified");
    if (status === "FAILED") return t("assetLock.status.item.failed");
    if (status === "SENT") return t("assetLock.status.item.sent");
    return t("assetLock.status.item.unverified");
  };

  const formatTransferAmount = (item: AssetLockState["items"][number] | null) => {
    if (!item) return "-";
    if (item.token) {
      return `${item.plannedAmount} ${item.token.currency} / ${item.token.issuer ?? "-"}`;
    }
    return `${item.plannedAmount} drops`;
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
    if (!statuses.length) return t("assetLock.status.regularKey.unverified");
    if (statuses.some((status) => status.status === "ERROR")) {
      return t("assetLock.status.regularKey.error");
    }
    if (statuses.every((status) => status.status === "VERIFIED")) {
      return t("assetLock.status.regularKey.verified");
    }
    return t("assetLock.status.regularKey.unverified");
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
      setError(err?.message ?? "assetLock.error.startFailed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (itemId: string) => {
    if (!caseId) return;
    const txHash = (txInputs[itemId] ?? "").trim();
    if (!txHash) {
      setError("assetLock.error.txHashRequired");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await verifyAssetLockItem(caseId, { itemId, txHash });
      setLockState(data);
    } catch (err: any) {
      setError(err?.message ?? "assetLock.error.verifyFailed");
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
      setError(err?.message ?? "assetLock.error.autoTransferFailed");
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
      setError(err?.message ?? "assetLock.error.completeFailed");
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
      setError(err?.message ?? "assetLock.error.backToRegularKeyFailed");
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
      setError(err?.message ?? "assetLock.error.confirmFailed");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (label: string, value: string) => {
    const result = await copyText(label, value);
    setCopyMessage(t(result.messageKey, result.values));
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
      setRegularKeyError(err?.message ?? "assetLock.error.regularKeyFailed");
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
      setError(err?.message ?? "assetLock.error.stepUpdateFailed");
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: t("nav.cases"), href: "/cases" },
            caseId
              ? { label: t("cases.detail.title"), href: `/cases/${caseId}` }
              : { label: t("cases.detail.title") },
            { label: t("assetLock.breadcrumb") }
          ]}
        />
        <div className={styles.headerRow}>
          <div>
            <div className={styles.headerMeta}>{t("assetLock.header.label")}</div>
            <h1 className="text-title">{t("assetLock.header.title")}</h1>
          </div>
          <div className={styles.stepChip}>
            <span className={styles.stepChipLabel}>{t("assetLock.header.stepLabel")}</span>
            <span className={styles.stepChipValue}>{stepLabel}</span>
          </div>
        </div>
      </header>

      {planValidationError ? (
        <FormAlert variant="error">{t(planValidationError)}</FormAlert>
      ) : null}
      {error ? <FormAlert variant="error">{t(error)}</FormAlert> : null}
      {isLocked ? (
        <FormAlert variant="success">
          {t("assetLock.completed", { seconds: redirectSeconds ?? 5 })}
        </FormAlert>
      ) : null}

      <div className={styles.stepCard}>
        <div className={styles.stepTitle}>{current.title}</div>
        {current.id === "prepare" ? (
          <div className={styles.stepBody}>
            <div>{t("assetLock.prepare.description")}</div>
            <div className={styles.planSection}>
              <div className={styles.planSectionTitle}>{t("assetLock.planPreview.title")}</div>
              {planLoading ? (
                <div className={styles.planHint}>{t("common.loading")}</div>
              ) : planError ? (
                <div className={styles.planHint}>{t(planError)}</div>
              ) : plans.length === 0 ? (
                <div className={styles.planHint}>{t("assetLock.planPreview.empty")}</div>
              ) : (
                <div className={styles.planList}>
                  {plans.map((plan) => (
                    <div key={plan.planId} className={styles.planCard}>
                      <div className={styles.planTitle}>{plan.title}</div>
                      <div className={styles.planMeta}>
                        {plan.status === "INACTIVE"
                          ? t("assetLock.planPreview.statusInactive")
                          : t("assetLock.planPreview.statusActive")}
                      </div>
                      <div className={styles.planRuleTitle}>
                        {t("assetLock.planPreview.rulesTitle")}
                      </div>
                      {planAssetsById[plan.planId] ? (
                        planAssetsById[plan.planId].length === 0 ? (
                          <div className={styles.planHint}>
                            {t("assetLock.planPreview.rulesEmpty")}
                          </div>
                        ) : (
                          <div className={styles.ruleList}>
                            {planAssetsById[plan.planId].map((asset) => {
                              const heirs = planHeirsById[plan.planId] ?? [];
                              return (
                                <div key={asset.planAssetId} className={styles.ruleItem}>
                                  <div className={styles.ruleHeader}>
                                    <span className={styles.ruleAsset}>{asset.assetLabel}</span>
                                    <span className={styles.ruleUnit}>
                                      {asset.unitType === "PERCENT"
                                        ? t("assetLock.planPreview.unit.percent")
                                        : t("assetLock.planPreview.unit.amount")}
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
                                    <div className={styles.planHint}>
                                      {t("assetLock.planPreview.allocationsEmpty")}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )
                      ) : (
                        <div className={styles.planHint}>
                          {t("assetLock.planPreview.rulesLoading")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {isOwner === true ? (
              <div className={styles.methodActions}>
                <Button
                  type="button"
                  onClick={handleConfirmPreparation}
                  disabled={loading || !!planValidationError}
                >
                  {loading
                    ? t("assetLock.prepare.confirming")
                    : t("assetLock.prepare.confirm")}
                </Button>
              </div>
            ) : (
              <div className={styles.planHint}>{t("assetLock.prepare.waitingOwner")}</div>
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
                    <div className={styles.methodTitle}>{t("assetLock.method.a.title")}</div>
                    <div className={styles.methodSummary}>
                      {t("assetLock.method.a.description")}
                    </div>
                  </div>
                </div>
                <ul className={styles.methodList}>
                  <li className={styles.methodListItem}>
                    {t("assetLock.method.a.bullets.verify")}
                  </li>
                  <li className={styles.methodListItem}>
                    {t("assetLock.method.a.bullets.eachAsset")}
                  </li>
                  <li className={styles.methodListItem}>
                    {t("assetLock.method.a.bullets.signatures")}
                  </li>
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
                      <span className={styles.methodTitle}>{t("assetLock.method.b.title")}</span>
                      <span className={styles.methodBadge}>
                        {t("assetLock.method.b.badge")}
                      </span>
                    </div>
                    <div className={styles.methodSummary}>
                      {t("assetLock.method.b.description")}
                    </div>
                  </div>
                </div>
                <ul className={styles.methodList}>
                  <li className={styles.methodListItem}>
                    {t("assetLock.method.b.bullets.singleSignature")}
                  </li>
                  <li className={styles.methodListItem}>
                    {t("assetLock.method.b.bullets.lessSteps")}
                  </li>
                  <li className={styles.methodListItem}>
                    {t("assetLock.method.b.bullets.recommended")}
                  </li>
                </ul>
              </label>
            </div>
            <div className={styles.methodActions}>
              <Button type="button" onClick={handleStart} disabled={loading || !!planValidationError}>
                {loading
                  ? t("assetLock.actions.starting")
                  : t("assetLock.actions.start")}
              </Button>
            </div>
          </div>
        ) : null}
        {current.id === "transfer" ? (
          <div className={styles.stepBody}>
            <div className={styles.transferHint}>
              {t("assetLock.transfer.hint")}
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
                          <span className={styles.methodStepTag}>
                            {t("assetLock.methodSteps.inProgress")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {lockState?.methodStep === "REGULAR_KEY_SET" ? (
                  <div className={styles.regularKeyCard}>
                    <div className={styles.regularKeyTitle}>{t("assetLock.regularKey.title")}</div>
                    <div className={styles.regularKeyBody}>
                      {t("assetLock.regularKey.description")}
                    </div>
                    <div className={styles.regularKeySummary}>
                      <span className={styles.regularKeySummaryLabel}>
                        {t("assetLock.regularKey.statusLabel")}
                      </span>
                      <span className={styles.regularKeySummaryValue}>
                        {getRegularKeySummary(regularKeyStatuses)}
                      </span>
                    </div>
                    <div className={styles.regularKeyNote}>
                      {t("assetLock.regularKey.note")}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRegularKeyOpen(true)}
                    >
                      {t("assetLock.regularKey.confirm")}
                    </Button>
                  </div>
                ) : null}
                {regularKeyStatuses.length > 0 ? (
                  <div className={styles.regularKeyStatusCard}>
                    <div className={styles.regularKeyStatusTitle}>
                      {t("assetLock.regularKey.resultTitle")}
                    </div>
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
                      {t("assetLock.transfer.autoTransferNote")}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReturnToRegularKey}
                      disabled={loading}
                    >
                      {t("assetLock.regularKey.back")}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setAutoTransferConfirmOpen(true)}
                      disabled={loading}
                    >
                      {loading
                        ? t("assetLock.actions.executing")
                        : t("assetLock.actions.executeAuto")}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={styles.transferList}>
                {(lockState?.items ?? []).length === 0 ? (
                  <div className={styles.emptyState}>{t("assetLock.transfer.emptyTargets")}</div>
                ) : (
                  (lockState?.items ?? []).map((item) => {
                    const assetAddress = resolveAssetAddress(item.assetId);
                    const canAppTransfer = Boolean(lockState?.wallet?.address);
                    return (
                      <div key={item.itemId} className={styles.transferRow}>
                        <div>
                          <div className={styles.transferLabel}>{item.assetLabel}</div>
                          <div className={styles.transferType}>
                            {item.token
                              ? t("assetLock.transfer.type.token")
                              : t("assetLock.transfer.type.xrp")}
                          </div>
                          <div className={styles.transferMeta}>
                            {item.token
                              ? `${item.token.currency} / ${item.token.issuer ?? ""}`
                              : "XRP"}
                            {" · "}
                            {t("assetLock.transfer.planned", { amount: item.plannedAmount })}
                          </div>
                        </div>
                        <FormField label={t("assetLock.transfer.txHashLabel")}>
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
                        <div className={styles.transferActions}>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenTransferDialog(item)}
                            disabled={!canAppTransfer}
                          >
                            {t("assetLock.transfer.appSend")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleVerify(item.itemId)}
                          >
                            {t("assetLock.transfer.verifyAction")}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        ) : null}
        {current.id === "verify" ? (
          <div className={styles.stepBody}>
            <div className={styles.verifyTitle}>{t("assetLock.verify.title")}</div>
            <div className={styles.balanceBlock}>
              <div className={styles.balanceHeader}>
                <div className={styles.balanceTitle}>{t("assetLock.verify.balanceTitle")}</div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={loadBalances}
                  disabled={balanceLoading}
                >
                  {t("assetLock.verify.reload")}
                </Button>
              </div>
              <div className={styles.balanceNote}>
                {t("assetLock.verify.note")}
              </div>
              {balanceError ? <FormAlert variant="error">{t(balanceError)}</FormAlert> : null}
              {balanceLoading ? (
                <div className={styles.balanceNote}>{t("assetLock.verify.loadingBalances")}</div>
              ) : null}
              {balances ? (
                <div className={styles.balanceGrid}>
                  <div className={styles.balanceItem}>
                    <div className={styles.balanceLabel}>{t("assetLock.verify.destination")}</div>
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
                        {t("assetLock.verify.source")}
                        {source.assetLabel ? ` (${source.assetLabel})` : ""}
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
              <div className={styles.emptyState}>{t("assetLock.verify.empty")}</div>
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
                      {item.token
                        ? t("assetLock.transfer.type.token")
                        : t("assetLock.transfer.type.xrp")}
                    </div>
                    <div className={styles.transferMeta}>
                      {t("assetLock.transfer.planned", { amount: item.plannedAmount })}
                    </div>
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
                {isLocked
                  ? t("assetLock.actions.completed")
                  : completeLoading
                    ? t("assetLock.actions.completing")
                    : t("assetLock.actions.complete")}
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
              {t("assetLock.actions.back")}
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog
        open={transferDialogOpen}
        onOpenChange={(open) => {
          setTransferDialogOpen(open);
          if (!open) {
            setTransferDialogItem(null);
            setTransferSendError(null);
            setTransferSendSuccess(null);
            setTransferSecret("");
            setTransferFromAddress("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("assetLock.transferDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("assetLock.transferDialog.description")}
            </DialogDescription>
          </DialogHeader>
          {transferSendError ? (
            <FormAlert variant="error">{t(transferSendError)}</FormAlert>
          ) : null}
          {transferSendSuccess ? (
            <FormAlert variant="success">{t(transferSendSuccess)}</FormAlert>
          ) : null}
          {copyMessage ? <FormAlert variant="info">{copyMessage}</FormAlert> : null}
          {transferDialogItem ? (
            <div className={styles.transferDialogGrid}>
              <FormField label={t("assetLock.transferDialog.fromLabel")}>
                <Input
                  value={transferFromAddress}
                  onChange={(event) => setTransferFromAddress(event.target.value)}
                  placeholder="r..."
                />
              </FormField>
              <div className={styles.transferDialogRow}>
                <div>
                  <div className={styles.transferDialogLabel}>
                    {t("assetLock.transferDialog.toLabel")}
                  </div>
                  <div className={styles.transferDialogValue}>
                    {lockState?.wallet?.address ?? "-"}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className={styles.copyButton}
                  onClick={() =>
                    handleCopy(t("assetLock.transferDialog.toLabel"), lockState?.wallet?.address ?? "")
                  }
                  aria-label={t("assetLock.transferDialog.toCopyLabel")}
                >
                  <Copy />
                </Button>
              </div>
              <div className={styles.transferDialogRow}>
                <div>
                  <div className={styles.transferDialogLabel}>
                    {t("assetLock.transferDialog.amountLabel")}
                  </div>
                  <div className={styles.transferDialogValue}>
                    {formatTransferAmount(transferDialogItem)}
                  </div>
                </div>
              </div>
              <FormField label={t("assetLock.transferDialog.secretLabel")}>
                <Input
                  value={transferSecret}
                  onChange={(event) => setTransferSecret(event.target.value)}
                  placeholder="s..."
                  type="password"
                />
              </FormField>
              <div className={styles.methodActions}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendTransfer}
                  disabled={transferSending}
                >
                  {transferSending
                    ? t("assetLock.transferDialog.sending")
                    : t("assetLock.transferDialog.send")}
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>{t("assetLock.transferDialog.empty")}</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={regularKeyOpen} onOpenChange={setRegularKeyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("assetLock.regularKeyDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("assetLock.regularKeyDialog.description")}
            </DialogDescription>
          </DialogHeader>
          {regularKeyError ? (
            <FormAlert variant="error">{t(regularKeyError)}</FormAlert>
          ) : null}
          {copyMessage ? <FormAlert variant="info">{copyMessage}</FormAlert> : null}
          <div className={styles.regularKeyInfo}>
            <div className={styles.regularKeyRow}>
              <div>
                <div className={styles.regularKeyLabel}>
                  {t("assetLock.regularKeyDialog.addressLabel")}
                </div>
                <div className={styles.regularKeyValue}>
                  {lockState?.wallet?.address ?? t("assetLock.regularKeyDialog.addressEmpty")}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className={styles.copyButton}
                onClick={() =>
                  handleCopy(t("assetLock.regularKeyDialog.copyLabel"), lockState?.wallet?.address ?? "")
                }
                aria-label={t("assetLock.regularKeyDialog.copyAriaLabel")}
              >
                <Copy />
              </Button>
            </div>
          </div>
          <div className={styles.methodActions}>
            <Button type="button" onClick={handleConfirmRegularKey} disabled={regularKeyLoading}>
              {regularKeyLoading
                ? t("assetLock.regularKeyDialog.confirming")
                : t("assetLock.regularKeyDialog.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={autoTransferConfirmOpen} onOpenChange={setAutoTransferConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("assetLock.autoTransferDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("assetLock.autoTransferDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className={styles.methodActions}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAutoTransferConfirmOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={handleConfirmAutoTransfer} disabled={loading}>
              {loading
                ? t("assetLock.actions.executing")
                : t("assetLock.autoTransferDialog.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </section>
  );
}
