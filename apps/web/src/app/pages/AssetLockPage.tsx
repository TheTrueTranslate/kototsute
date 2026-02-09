import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import { useAuth } from "../../features/auth/auth-provider";
import { Button } from "../../features/shared/components/ui/button";
import FormField from "../../features/shared/components/form-field";
import FormAlert from "../../features/shared/components/form-alert";
import { Input } from "../../features/shared/components/ui/input";
import XrplExplorerLink from "../../features/shared/components/xrpl-explorer-link";
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

type WalletActivationStatus = NonNullable<AssetLockState["wallet"]>["activationStatus"];

const shouldStayOnTransferStepAfterRegularKeyClear = (
  lock: AssetLockState | null | undefined
) =>
  lock?.method === "B" &&
  lock?.methodStep === "REGULAR_KEY_CLEARED" &&
  lock?.uiStep !== 4;

const resolveDisplayStepIndex = (
  lock: AssetLockState | null | undefined,
  fallback: number
) => {
  if (shouldStayOnTransferStepAfterRegularKeyClear(lock)) {
    return 1;
  }
  return resolveAssetLockStepIndex(lock?.uiStep, fallback);
};

const shouldShowAutoTransferTxHashes = (lock: AssetLockState | null | undefined) =>
  lock?.method === "B" &&
  (lock?.methodStep === "TRANSFER_DONE" || lock?.methodStep === "REGULAR_KEY_CLEARED");

export default function AssetLockPage({
  initialLock = null,
  initialStep = 0,
  initialPlans,
  initialPlanAssets,
  initialPlanHeirs,
  initialIsOwner = null,
  initialCaseData = null,
  initialAutoTransferConfirmOpen,
  initialBalances = null
}: AssetLockPageProps) {
  const { caseId } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const steps = [
    { id: "prepare", title: t("assetLock.steps.prepare") },
    { id: "transfer", title: t("assetLock.steps.transfer") },
    { id: "verify", title: t("assetLock.steps.verify") }
  ];
  const [stepIndex, setStepIndex] = useState(() =>
    resolveDisplayStepIndex(initialLock, initialStep)
  );
  const [lockState, setLockState] = useState<AssetLockState | null>(initialLock);
  const method = "B" as const;
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
  const [lockReloading, setLockReloading] = useState(false);
  const [completeLoading, setCompleteLoading] = useState(false);
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

  const stepDisplayIndex = stepIndex + 1;
  const stepLabel = `${stepDisplayIndex} / ${steps.length}`;
  const regularKeyStatuses = lockState?.regularKeyStatuses ?? [];
  const showWalletSummarySections =
    method === "B" && (regularKeyStatuses.length > 0 || shouldShowAutoTransferTxHashes(lockState));
  const isLocked = lockState?.status === "LOCKED";
  const canComplete =
    (lockState?.items ?? []).length > 0 &&
    (lockState?.items ?? []).every((item) => item.status === "VERIFIED");
  const pendingVerificationCount = (lockState?.items ?? []).filter(
    (item) => item.status !== "VERIFIED"
  ).length;
  const isPlanDataReady =
    !planLoading &&
    plans.every((plan) => planHeirsById[plan.planId] !== undefined);
  const planValidationError = useMemo(() => {
    if (!isPlanDataReady) return null;
    if (plans.length === 0) return "assetLock.validation.noPlans";
    const hasMissingHeirs = plans.some(
      (plan) => (planHeirsById[plan.planId]?.length ?? 0) === 0
    );
    if (hasMissingHeirs) return "assetLock.validation.missingHeirs";
    return null;
  }, [isPlanDataReady, planHeirsById, plans]);

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

  const autoTransferTxHashes = useMemo(
    () =>
      (lockState?.items ?? []).flatMap((item) => {
        const txHash = typeof item.txHash === "string" ? item.txHash.trim() : "";
        if (!txHash) return [];
        return [
          {
            itemId: item.itemId,
            assetLabel: item.assetLabel,
            txHash
          }
        ];
      }),
    [lockState?.items]
  );

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

  const loadLockState = useCallback(
    async (input?: { silent?: boolean }) => {
      if (!caseId) return;
      if (!input?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await getAssetLock(caseId);
        setLockState(data);
      } catch (err: any) {
        setError(err?.message ?? "assetLock.error.lockFetch");
      } finally {
        if (!input?.silent) {
          setLoading(false);
        }
      }
    },
    [caseId]
  );

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

  const handleReloadVerify = async () => {
    setLockReloading(true);
    try {
      await Promise.all([loadBalances(), loadLockState({ silent: true })]);
    } finally {
      setLockReloading(false);
    }
  };

  useEffect(() => {
    if (!caseId || initialLock) return;
    void loadLockState();
  }, [caseId, initialLock, loadLockState]);

  useEffect(() => {
    if (!caseId || current?.id !== "verify") return;
    loadBalances();
  }, [caseId, current?.id]);

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
    if (typeof lockState?.uiStep !== "number") return;
    if (prevUiStepRef.current === lockState.uiStep) return;
    prevUiStepRef.current = lockState.uiStep;
    const nextIndex = resolveDisplayStepIndex(lockState, stepIndex);
    if (nextIndex !== stepIndex) {
      setStepIndex(nextIndex);
    }
  }, [lockState?.method, lockState?.methodStep, lockState?.uiStep, stepIndex]);

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

  const formatTokenMeta = (token: PlanAsset["token"] | null) => {
    if (!token) return "-";
    const currency = token.isNative ? "XRP" : token.currency;
    const issuer = token.isNative ? "-" : token.issuer ?? "-";
    return t("assetLock.planPreview.tokenMeta", { currency, issuer });
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

  const formatWalletActivationStatus = (status: WalletActivationStatus) => {
    if (status === "ACTIVATED") return t("assetLock.walletCheck.status.activated");
    if (status === "ERROR") return t("assetLock.walletCheck.status.error");
    return t("assetLock.walletCheck.status.pending");
  };

  const getWalletActivationStatusClass = (status: WalletActivationStatus) => {
    if (status === "ACTIVATED") return styles.walletCheckStatusActivated;
    if (status === "ERROR") return styles.walletCheckStatusError;
    return styles.walletCheckStatusPending;
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
      const nextIndex = resolveStartStepIndex(data, 1);
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
      const shouldStayOnTransferStep =
        data.method === "B" && data.methodStep === "REGULAR_KEY_CLEARED";
      if (shouldStayOnTransferStep) {
        const transferIndex = 1;
        setStepIndex(transferIndex);
        const transferState = { ...data, uiStep: 3 };
        setLockState(transferState);
        const synced = await syncAssetLockStep(caseId, transferIndex);
        if (synced) {
          setLockState(synced);
        }
        return;
      }
      setLockState(data);
      const nextIndex = resolveDisplayStepIndex(data, 2);
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

  const handleGoToVerify = async () => {
    const nextIndex = 2;
    setStepIndex(nextIndex);
    if (!caseId) return;
    try {
      const synced = await syncAssetLockStep(caseId, nextIndex);
      if (synced) {
        setLockState(synced);
      }
    } catch (err: any) {
      setError(err?.message ?? "assetLock.error.stepUpdateFailed");
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

  const renderVerifySection = () => (
    <div className={styles.stepBody}>
      <div className={styles.balanceHeader}>
        <div className={styles.balanceTitle}>{t("assetLock.verify.balanceTitle")}</div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleReloadVerify}
          disabled={balanceLoading || lockReloading}
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
            <XrplExplorerLink
              className={styles.balanceLink}
              value={balances.destination.address}
            >
              {balances.destination.address}
            </XrplExplorerLink>
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
              <XrplExplorerLink className={styles.balanceLink} value={source.address}>
                {source.address}
              </XrplExplorerLink>
              {source.status === "error" && formatBalanceError(source.message) ? (
                <div className={styles.balanceError}>
                  {formatBalanceError(source.message)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
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
                <div className={styles.transferMeta}>
                  TX Hash:{" "}
                  <XrplExplorerLink
                    className={styles.balanceLink}
                    value={item.txHash}
                    resource="transaction"
                  >
                    {item.txHash}
                  </XrplExplorerLink>
                </div>
              ) : null}
              {item.error ? (
                <div className={styles.statusErrorText}>{item.error}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {pendingVerificationCount > 0 ? (
        <div className={styles.verifyPendingNote}>
          {t("assetLock.verify.pendingNote", { count: pendingVerificationCount })}
        </div>
      ) : null}
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
  );

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
          {t("assetLock.completed")}
        </FormAlert>
      ) : null}

      <div className={styles.stepCard}>
        <div className={styles.stepTitle}>
          {current.title}
        </div>
        {lockState?.wallet?.address ? (
          <div className={styles.walletCheckCard}>
            <div className={styles.walletCheckHeader}>
              <div className={styles.walletCheckTitle}>{t("assetLock.walletCheck.title")}</div>
              <span
                className={`${styles.walletCheckStatus} ${getWalletActivationStatusClass(
                  lockState.wallet.activationStatus
                )}`}
              >
                {formatWalletActivationStatus(lockState.wallet.activationStatus)}
              </span>
            </div>
            <div className={styles.walletCheckAddressRow}>
              <div className={styles.walletCheckLabel}>
                {t("assetLock.walletCheck.addressLabel")}
              </div>
              <XrplExplorerLink
                className={styles.walletCheckAddress}
                value={lockState.wallet.address}
              >
                {lockState.wallet.address}
              </XrplExplorerLink>
            </div>
            {lockState.wallet.activationMessage ? (
              <div className={styles.walletCheckMessage}>{lockState.wallet.activationMessage}</div>
            ) : null}
            {showWalletSummarySections ? (
              <div className={styles.walletSummaryArea}>
                {regularKeyStatuses.length > 0 ? (
                  <div className={styles.summarySection}>
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
                {shouldShowAutoTransferTxHashes(lockState) ? (
                  <div className={styles.summarySection}>
                    <div className={styles.regularKeyStatusTitle}>
                      {t("assetLock.transfer.usedTxHashTitle")}
                    </div>
                    {autoTransferTxHashes.length > 0 ? (
                      <div className={styles.regularKeyStatusList}>
                        {autoTransferTxHashes.map((item) => (
                          <div
                            key={`${item.itemId}-${item.txHash}`}
                            className={styles.regularKeyStatusItem}
                          >
                            <div className={styles.regularKeyStatusRow}>
                              <div className={styles.regularKeyStatusLabel}>
                                {item.assetLabel || item.itemId}
                              </div>
                              <XrplExplorerLink
                                className={styles.balanceLink}
                                value={item.txHash}
                                resource="transaction"
                              >
                                {item.txHash}
                              </XrplExplorerLink>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.planHint}>
                        {t("assetLock.transfer.usedTxHashEmpty")}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
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
                              const tokenMeta = asset.token ? formatTokenMeta(asset.token) : null;
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
                                  {asset.token ? (
                                    <div className={styles.ruleTokenSection}>
                                      <div className={styles.ruleSubTitle}>
                                        {t("assetLock.planPreview.tokenTitle")}
                                      </div>
                                      <div className={styles.ruleTokenMeta}>{tokenMeta}</div>
                                    </div>
                                  ) : null}
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
                                  {(asset.nfts ?? []).length > 0 ? (
                                    <div className={styles.ruleNftSection}>
                                      <div className={styles.ruleSubTitle}>
                                        {t("assetLock.planPreview.nftTitle")}
                                      </div>
                                      <div className={styles.ruleNftList}>
                                        {(asset.nfts ?? []).map((nft) => {
                                          const allocation = (asset.nftAllocations ?? []).find(
                                            (item) => item.tokenId === nft.tokenId
                                          );
                                          const heir = heirs.find(
                                            (item) => item.uid === allocation?.heirUid
                                          ) ?? null;
                                          const isUnallocated = !allocation?.heirUid;
                                          return (
                                            <div
                                              key={`${asset.planAssetId}-${nft.tokenId}`}
                                              className={styles.ruleRow}
                                            >
                                              <span className={styles.ruleTokenId}>
                                                {nft.tokenId}
                                              </span>
                                              <span className={styles.ruleHeir}>
                                                {renderHeirLabel(heir, isUnallocated)}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : null}
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
                  onClick={handleStart}
                  disabled={loading || !!planValidationError}
                >
                  {loading
                    ? t("assetLock.actions.starting")
                    : t("assetLock.actions.start")}
                </Button>
              </div>
            ) : (
              <div className={styles.planHint}>{t("assetLock.prepare.waitingOwner")}</div>
            )}
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
                  const isClearRegularKeyCompleted =
                    lockState?.methodStep === "REGULAR_KEY_CLEARED";
                  const status =
                    currentIndex === -1
                      ? "pending"
                      : isClearRegularKeyCompleted && index <= currentIndex
                      ? "done"
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
                {lockState?.methodStep === "AUTO_TRANSFER" ? (
                  <div className={styles.methodActions}>
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
                {lockState?.methodStep === "REGULAR_KEY_CLEARED" ? (
                  <div className={styles.methodActions}>
                    <Button type="button" onClick={handleGoToVerify}>
                      {t("assetLock.actions.next")}
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
        {current.id === "verify" ? renderVerifySection() : null}
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
