import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import Tabs from "../../features/shared/components/tabs";
import { Button } from "../../features/shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../features/shared/components/ui/dialog";
import { Input } from "../../features/shared/components/ui/input";
import { Textarea } from "../../features/shared/components/ui/textarea";
import { getCase, type CaseSummary } from "../api/cases";
import { listAssets, type AssetListItem } from "../api/assets";
import { listPlans, type PlanListItem } from "../api/plans";
import type { DeathClaimSummary } from "../api/death-claims";
import {
  getApprovalTx,
  getSignerList,
  prepareApprovalTx,
  submitSignerSignature,
  type ApprovalTxSummary,
  type SignerListSummary
} from "../api/signer-list";
import {
  executeDistribution,
  getDistributionState,
  listDistributionItems,
  type DistributionItem,
  type DistributionState
} from "../api/distribution";
import {
  confirmHeirWalletVerify,
  getHeirWallet,
  requestHeirWalletVerifyChallenge,
  saveHeirWallet,
  type HeirWallet
} from "../api/heir-wallets";
import { getAssetLock } from "../api/asset-lock";
import {
  createInvite,
  listCaseHeirs,
  listInvitesByOwner,
  updateInvite,
  type CaseHeir,
  type InviteListItem
} from "../api/invites";
import { useAuth } from "../../features/auth/auth-provider";
import { copyText } from "../../features/shared/lib/copy-text";
import {
  createPaymentTx,
  signForMultisign,
  signSingle,
  submitSignedBlob
} from "../../features/xrpl/xrpl-client";
import { shouldAutoRequestChallenge } from "../../features/shared/lib/auto-challenge";
import { shouldCloseWalletDialogOnVerify } from "../../features/shared/lib/wallet-dialog";
import { WalletVerifyPanel } from "../../features/shared/components/wallet-verify-panel";
import { autoVerifyWalletOwnership } from "../../features/shared/lib/wallet-verify";
import styles from "../../styles/caseDetailPage.module.css";
import { DeathClaimsPanel } from "./DeathClaimsPage";
import {
  acceptNftSellOffer,
  getRelationOptionKey,
  relationOptions,
  relationOtherValue,
  type RelationOption
} from "@kototsute/shared";

type LocalizedMessage = {
  key: string;
  values?: Record<string, number | string>;
};

type NftReceiveStatus = "PENDING" | "SUCCESS" | "FAILED";

export const formatDistributionProgressText = (
  distribution: DistributionState | null
) : LocalizedMessage | null => {
  if (!distribution?.totalCount) return null;
  return {
    key: "cases.detail.distribution.progress",
    values: {
      success: distribution.successCount,
      total: distribution.totalCount
    }
  };
};

export const resolveDistributionDisabledReason = (input: {
  caseData: CaseSummary | null;
  approvalCompleted: boolean;
  totalHeirCount: number;
  unverifiedHeirCount: number;
  distribution: DistributionState | null;
  distributionLoading: boolean;
}): LocalizedMessage | null => {
  if (!input.caseData) return { key: "cases.detail.distribution.disabled.noCase" };
  if (input.caseData.stage !== "IN_PROGRESS") {
    return { key: "cases.detail.distribution.disabled.notInProgress" };
  }
  if (!input.approvalCompleted) {
    return { key: "cases.detail.distribution.disabled.approvalIncomplete" };
  }
  if (input.totalHeirCount === 0) {
    return { key: "cases.detail.distribution.disabled.noHeirs" };
  }
  if (input.unverifiedHeirCount > 0) {
    return {
      key: "cases.detail.distribution.disabled.unverified",
      values: { count: input.unverifiedHeirCount }
    };
  }
  if (input.distributionLoading) {
    return { key: "cases.detail.distribution.disabled.loading" };
  }
  if (input.distribution?.status === "COMPLETED") {
    return { key: "cases.detail.distribution.disabled.completed" };
  }
  if (input.distribution?.status === "RUNNING") {
    return { key: "cases.detail.distribution.disabled.running" };
  }
  return null;
};

export const shouldFetchApprovalTx = (input: {
  isHeir: boolean;
  tab: string | null;
  caseId?: string | null;
  canAccessDeathClaims: boolean;
  caseStage?: string | null;
  signerStatus?: string | null;
}) => {
  if (!input.isHeir) return false;
  if (input.tab !== "death-claims") return false;
  if (!input.caseId) return false;
  if (!input.canAccessDeathClaims) return false;
  if (input.caseStage !== "IN_PROGRESS") return false;
  if (input.signerStatus !== "SET") return false;
  return true;
};

export const shouldPollApprovalStatus = (input: {
  isHeir: boolean;
  tab: string | null;
  caseId?: string | null;
  canAccessDeathClaims: boolean;
  caseStage?: string | null;
  signerStatus?: string | null;
  approvalStatus?: string | null;
}) =>
  shouldFetchApprovalTx(input) && input.approvalStatus === "SUBMITTED";

export const shouldShowSignerActions = (approvalStatus?: string | null) =>
  approvalStatus !== "SUBMITTED";

export const shouldShowSignerDetails = (approvalStatus?: string | null) =>
  approvalStatus !== "SUBMITTED";

export const isApprovalCompleted = (input: {
  approvalStatus?: string | null;
  networkStatus?: string | null;
  networkResult?: string | null;
}) =>
  input.approvalStatus === "SUBMITTED" &&
  input.networkStatus === "VALIDATED" &&
  (!input.networkResult || input.networkResult === "tesSUCCESS");

export const resolveInheritanceNextAction = (input: {
  claimStatus?: string | null;
  caseStage?: string | null;
  signerStatus?: string | null;
  approvalStatus?: string | null;
  signerCompleted: boolean;
}) => {
  if (input.claimStatus === "ADMIN_APPROVED" && input.caseStage === "WAITING") {
    return {
      stepIndex: 0,
      titleKey: "cases.detail.inheritance.steps.adminApproved.title",
      descriptionKey: "cases.detail.inheritance.steps.adminApproved.description"
    };
  }
  if (input.caseStage === "IN_PROGRESS" && input.signerCompleted) {
    return {
      stepIndex: 3,
      titleKey: "cases.detail.inheritance.steps.signerCompleted.title",
      descriptionKey: "cases.detail.inheritance.steps.signerCompleted.description"
    };
  }
  if (input.caseStage === "IN_PROGRESS" && input.signerStatus !== "SET") {
    return {
      stepIndex: 1,
      titleKey: "cases.detail.inheritance.steps.preparing.title",
      descriptionKey: "cases.detail.inheritance.steps.preparing.description"
    };
  }
  if (input.caseStage === "IN_PROGRESS" && input.approvalStatus === "PREPARED") {
    return {
      stepIndex: 2,
      titleKey: "cases.detail.inheritance.steps.awaitingSign.title",
      descriptionKey: "cases.detail.inheritance.steps.awaitingSign.description"
    };
  }
  return null;
};

export const resolveHeirFlowStepIndex = (input: {
  hasHeirWallet: boolean;
  hasDeathClaim: boolean;
  hasSignature: boolean;
  hasReceive: boolean;
}) => {
  if (!input.hasHeirWallet) return 0;
  if (!input.hasDeathClaim) return 1;
  if (!input.hasSignature) return 2;
  if (!input.hasReceive) return 3;
  return 3;
};

export const resolveDeathClaimDocumentsHintKey = (input: {
  isHeir: boolean;
  hasClaim: boolean;
  claimStatus?: string | null;
  confirmedByMe: boolean;
}) => {
  if (!input.isHeir) return "cases.detail.deathClaims.documents.hint";
  if (!input.hasClaim) return "deathClaims.currentAction.submit.description";
  if (input.claimStatus === "ADMIN_REJECTED") {
    return "deathClaims.currentAction.resubmit.description";
  }
  if (input.claimStatus === "ADMIN_APPROVED" && !input.confirmedByMe) {
    return "deathClaims.currentAction.confirm.description";
  }
  if (input.claimStatus === "CONFIRMED") return "deathClaims.currentAction.confirmed.description";
  if (input.confirmedByMe) return "deathClaims.currentAction.confirmedByMe.description";
  return "deathClaims.currentAction.waiting.description";
};

export const resolvePrepareDisabledReason = (input: {
  caseData: CaseSummary | null;
  signerStatusKey: string;
  totalHeirCount: number;
  unverifiedHeirCount: number;
  approvalTx: ApprovalTxSummary | null;
}): LocalizedMessage | null => {
  if (!input.caseData) return { key: "cases.detail.prepare.disabled.noCase" };
  if (input.caseData.stage !== "IN_PROGRESS") {
    return { key: "cases.detail.prepare.disabled.notInProgress" };
  }
  const approvalPrepared =
    input.approvalTx?.status === "PREPARED" ||
    input.approvalTx?.status === "SUBMITTED" ||
    Boolean(input.approvalTx?.txJson);
  if (input.signerStatusKey === "SET" && approvalPrepared) {
    return { key: "cases.detail.prepare.disabled.completed" };
  }
  if (input.totalHeirCount === 0) {
    return { key: "cases.detail.prepare.disabled.noHeirs" };
  }
  if (input.unverifiedHeirCount > 0) {
    return {
      key: "cases.detail.prepare.disabled.unverified",
      values: { count: input.unverifiedHeirCount }
    };
  }
  return null;
};

export const resolveApprovalTxErrorMessage = (error: any) => {
  const code = error?.data?.code;
  if (code === "NOT_FOUND") return null;
  return error?.message ?? "cases.detail.signer.error.loadFailed";
};

export const resolveSignerListErrorMessage = (
  message: string | null | undefined
): string | LocalizedMessage | null => {
  if (!message) return null;
  if (/^Account not found\.?$/i.test(message.trim())) {
    return { key: "cases.detail.signer.error.accountNotFound" };
  }
  return message;
};

type AssetRowProps = {
  caseId?: string;
  asset: AssetListItem;
};

export const AssetRow = ({ caseId, asset }: AssetRowProps) => {
  const { t, i18n } = useTranslation();
  const verificationLabels: Record<AssetListItem["verificationStatus"], string> = {
    UNVERIFIED: t("cases.detail.assets.verification.unverified"),
    PENDING: t("cases.detail.assets.verification.pending"),
    VERIFIED: t("cases.detail.assets.verification.verified")
  };
  const formatDate = (value: string | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString(i18n.language);
  };
  const content = (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowTitle}>{asset.label}</div>
        <div className={styles.rowMeta}>{asset.address}</div>
      </div>
      <div className={styles.rowSide}>
        <div className={styles.rowBadgeStack}>
          <span className={styles.statusBadge}>
            {verificationLabels[asset.verificationStatus] ?? asset.verificationStatus}
          </span>
          <span className={styles.badgeMuted}>{formatDate(asset.createdAt)}</span>
        </div>
      </div>
    </div>
  );

  if (!caseId) {
    return content;
  }

  return (
    <Link to={`/cases/${caseId}/assets/${asset.assetId}`} className={styles.rowLink}>
      {content}
    </Link>
  );
};

type TabKey = "assets" | "plans" | "heirs" | "wallet" | "death-claims";

type CaseDetailPageProps = {
  initialTab?: TabKey;
  initialIsOwner?: boolean | null;
  initialCaseData?: CaseSummary | null;
  initialPlans?: PlanListItem[];
  initialDistributionWalletAddress?: string | null;
  initialHeirWallet?: HeirWallet | null;
  initialHeirs?: CaseHeir[];
  initialOwnerInvites?: InviteListItem[];
  initialWalletDialogOpen?: boolean;
  initialWalletDialogMode?: "register" | "verify";
  initialDeathClaim?: DeathClaimSummary | null;
  initialSignerList?: SignerListSummary | null;
  initialApprovalTx?: ApprovalTxSummary | null;
  initialDistribution?: DistributionState | null;
  initialDistributionItems?: DistributionItem[];
};

const allTabKeys: TabKey[] = ["assets", "plans", "heirs", "wallet", "death-claims"];

const isTabKey = (value: string | null): value is TabKey =>
  Boolean(value && allTabKeys.includes(value as TabKey));

export default function CaseDetailPage({
  initialTab,
  initialIsOwner = null,
  initialCaseData = null,
  initialPlans = [],
  initialDistributionWalletAddress = null,
  initialHeirWallet = null,
  initialHeirs = [],
  initialOwnerInvites = [],
  initialWalletDialogOpen = false,
  initialWalletDialogMode = "register",
  initialDeathClaim = null,
  initialSignerList = null,
  initialApprovalTx = null,
  initialDistribution = null,
  initialDistributionItems = []
}: CaseDetailPageProps) {
  const { caseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get("tab");
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [caseData, setCaseData] = useState<CaseSummary | null>(initialCaseData);
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [plans, setPlans] = useState<PlanListItem[]>(initialPlans);
  const [ownerInvites, setOwnerInvites] = useState<InviteListItem[]>(initialOwnerInvites);
  const [heirs, setHeirs] = useState<CaseHeir[]>(initialHeirs);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRelation, setInviteRelation] = useState<RelationOption>(relationOptions[0]);
  const [inviteRelationOther, setInviteRelationOther] = useState("");
  const [inviteMemo, setInviteMemo] = useState("");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editingInvite, setEditingInvite] = useState<InviteListItem | null>(null);
  const [inviteEditRelation, setInviteEditRelation] = useState<RelationOption>(relationOptions[0]);
  const [inviteEditRelationOther, setInviteEditRelationOther] = useState("");
  const [inviteEditMemo, setInviteEditMemo] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteUpdating, setInviteUpdating] = useState(false);
  const [tab, setTab] = useState<TabKey>(() =>
    initialTab ?? (isTabKey(queryTab) ? queryTab : "assets")
  );
  const [loading, setLoading] = useState(!initialCaseData);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState<boolean | null>(() => {
    if (typeof initialIsOwner === "boolean") return initialIsOwner;
    if (initialCaseData && user?.uid) {
      return initialCaseData.ownerUid === user.uid;
    }
    return null;
  });
  const [heirWallet, setHeirWallet] = useState<HeirWallet | null>(initialHeirWallet);
  const [heirWalletLoading, setHeirWalletLoading] = useState(false);
  const [heirWalletError, setHeirWalletError] = useState<string | null>(null);
  const [ownerDistributionWalletAddress, setOwnerDistributionWalletAddress] = useState<
    string | null
  >(initialDistributionWalletAddress);
  const [deathClaim, setDeathClaim] = useState<DeathClaimSummary | null>(initialDeathClaim);
  const [heirWalletSaving, setHeirWalletSaving] = useState(false);
  const [heirWalletVerifyLoading, setHeirWalletVerifyLoading] = useState(false);
  const [heirWalletVerifyError, setHeirWalletVerifyError] = useState<string | null>(null);
  const [heirWalletVerifySuccess, setHeirWalletVerifySuccess] = useState<string | null>(null);
  const [heirWalletSending, setHeirWalletSending] = useState(false);
  const [heirWalletSecret, setHeirWalletSecret] = useState("");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [heirWalletChallenge, setHeirWalletChallenge] = useState<{
    challenge: string;
    address: string;
    amountDrops: string;
  } | null>(null);
  const [heirWalletAddressInput, setHeirWalletAddressInput] = useState(
    initialHeirWallet?.address ?? ""
  );
  const [walletDialogOpen, setWalletDialogOpen] = useState(initialWalletDialogOpen);
  const [walletDialogMode, setWalletDialogMode] =
    useState<"register" | "verify">(initialWalletDialogMode);
  const [signerList, setSignerList] = useState<SignerListSummary | null>(initialSignerList);
  const [signerLoading, setSignerLoading] = useState(false);
  const [signerError, setSignerError] = useState<string | null>(null);
  const [approvalTx, setApprovalTx] = useState<ApprovalTxSummary | null>(initialApprovalTx);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [distribution, setDistribution] = useState<DistributionState | null>(initialDistribution);
  const [distributionLoading, setDistributionLoading] = useState(false);
  const [distributionError, setDistributionError] = useState<string | null>(null);
  const [distributionExecuting, setDistributionExecuting] = useState(false);
  const [distributionItems, setDistributionItems] =
    useState<DistributionItem[]>(initialDistributionItems);
  const [distributionItemsLoading, setDistributionItemsLoading] = useState(false);
  const [distributionItemsError, setDistributionItemsError] = useState<string | null>(null);
  const [nftReceiveSeed, setNftReceiveSeed] = useState("");
  const [nftReceiveExecuting, setNftReceiveExecuting] = useState(false);
  const [nftReceiveError, setNftReceiveError] = useState<string | null>(null);
  const [nftReceiveResults, setNftReceiveResults] = useState<
    Record<string, { status: NftReceiveStatus; error?: string | null }>
  >({});
  const [prepareLoading, setPrepareLoading] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [prepareSuccess, setPrepareSuccess] = useState<string | null>(null);
  const [signerSeed, setSignerSeed] = useState("");
  const [signerSignedBlob, setSignerSignedBlob] = useState("");
  const [signerSigning, setSignerSigning] = useState(false);
  const [signerSubmitting, setSignerSubmitting] = useState(false);
  const autoSignKeyRef = useRef("");
  const caseStatusLabels = useMemo(
    () => ({
      DRAFT: t("cases.status.draft"),
      WAITING: t("cases.status.waiting"),
      IN_PROGRESS: t("cases.status.inProgress"),
      COMPLETED: t("cases.status.completed")
    }),
    [t]
  );
  const walletStatusLabels = useMemo(
    () => ({
      UNREGISTERED: t("cases.detail.heirs.walletStatus.unregistered"),
      PENDING: t("cases.detail.heirs.walletStatus.pending"),
      VERIFIED: t("cases.detail.heirs.walletStatus.verified")
    }),
    [t]
  );
  const signerStatusLabels = useMemo(
    () => ({
      NOT_READY: t("cases.detail.signer.status.notReady"),
      SET: t("cases.detail.signer.status.set"),
      FAILED: t("cases.detail.signer.status.failed")
    }),
    [t]
  );
  const approvalStatusLabels = useMemo(
    () => ({
      PREPARED: t("cases.detail.signer.approvalStatus.prepared"),
      SUBMITTED: t("cases.detail.signer.approvalStatus.submitted"),
      FAILED: t("cases.detail.signer.approvalStatus.failed")
    }),
    [t]
  );
  const approvalNetworkStatusLabels = useMemo(
    () => ({
      PENDING: t("cases.detail.signer.networkStatus.pending"),
      VALIDATED: t("cases.detail.signer.networkStatus.validated"),
      FAILED: t("cases.detail.signer.networkStatus.failed"),
      NOT_FOUND: t("cases.detail.signer.networkStatus.notFound"),
      EXPIRED: t("cases.detail.signer.networkStatus.expired")
    }),
    [t]
  );
  const distributionStatusLabels = useMemo(
    () => ({
      PENDING: t("cases.detail.distribution.status.pending"),
      RUNNING: t("cases.detail.distribution.status.running"),
      PARTIAL: t("cases.detail.distribution.status.partial"),
      COMPLETED: t("cases.detail.distribution.status.completed"),
      FAILED: t("cases.detail.distribution.status.failed")
    }),
    [t]
  );
  const nftReceiveStatusLabels = useMemo(
    () => ({
      PENDING: t("cases.detail.nftReceive.status.pending"),
      SUCCESS: t("cases.detail.nftReceive.status.success"),
      FAILED: t("cases.detail.nftReceive.status.failed")
    }),
    [t]
  );
  const formatDate = (value: string | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString(i18n.language);
  };
  const resolveMessage = (message: string | LocalizedMessage | null | undefined) => {
    if (!message) return null;
    if (typeof message === "string") return t(message);
    return t(message.key, message.values);
  };
  const tabItems = useMemo(() => {
    const baseTabItems = [
      { key: "assets" as const, label: t("cases.detail.tabs.assets") },
      { key: "plans" as const, label: t("cases.detail.tabs.plans") },
      { key: "heirs" as const, label: t("cases.detail.tabs.heirs") }
    ];
    if (isOwner === false) {
      return [
        { key: "wallet" as const, label: t("cases.detail.tabs.wallet") },
        { key: "death-claims" as const, label: t("cases.detail.tabs.deathClaims") },
        baseTabItems[0],
        baseTabItems[1],
        baseTabItems[2]
      ];
    }
    return baseTabItems;
  }, [isOwner, t]);
  const availableTabKeys = useMemo(() => tabItems.map((item) => item.key), [tabItems]);

  const title = useMemo(
    () => caseData?.ownerDisplayName ?? t("cases.detail.title"),
    [caseData, t]
  );
  const showOwnerDistributionWallet =
    isOwner === true && caseData?.stage === "IN_PROGRESS";
  const isHeir = isOwner === false;
  const isLocked = caseData?.assetLockStatus === "LOCKED";
  const canAccessDeathClaims =
    caseData?.stage === "WAITING" ||
    caseData?.stage === "IN_PROGRESS" ||
    caseData?.stage === "COMPLETED";
  const hasHeirWallet = Boolean(heirWallet?.address);
  const isHeirWalletVerified = heirWallet?.verificationStatus === "VERIFIED";
  const heirWalletDestinationDisplay =
    heirWalletChallenge?.address ??
    (heirWalletVerifyLoading
      ? t("cases.detail.wallet.memoIssuing")
      : t("cases.detail.wallet.memoEmpty"));
  const heirWalletMemoDisplay =
    heirWalletChallenge?.challenge ??
    (heirWalletVerifyLoading
      ? t("cases.detail.wallet.memoIssuing")
      : t("cases.detail.wallet.memoEmpty"));
  const renderRelationLabel = (label?: string | null, other?: string | null) => {
    if (!label) return t("common.unset");
    if (label === relationOtherValue) {
      return other?.trim() ? other : t("relations.other");
    }
    const relationKey = getRelationOptionKey(label);
    return relationKey ? t(relationKey) : label;
  };
  const toRelationOption = (label?: string | null): RelationOption => {
    if (!label) return relationOptions[0];
    return relationOptions.includes(label as RelationOption)
      ? (label as RelationOption)
      : relationOtherValue;
  };
  const signerStatusKey = signerList?.status ?? "NOT_READY";
  const signerStatusLabel = signerStatusLabels[signerStatusKey] ?? signerStatusKey;
  const approvalStatusLabel = approvalTx?.status
    ? approvalStatusLabels[approvalTx.status as keyof typeof approvalStatusLabels] ??
      approvalTx.status
    : t("cases.detail.signer.approvalStatus.unset");
  const approvalSubmittedTxHash = approvalTx?.submittedTxHash ?? "";
  const approvalNetworkStatus = approvalTx?.networkStatus ?? null;
  const approvalNetworkStatusLabel = approvalNetworkStatus
    ? approvalNetworkStatusLabels[approvalNetworkStatus] ?? approvalNetworkStatus
    : approvalTx?.status === "SUBMITTED"
      ? t("cases.detail.signer.networkStatus.pending")
      : "-";
  const approvalNetworkDetail = approvalTx?.networkResult
    ? `${approvalNetworkStatusLabel} (${approvalTx.networkResult})`
    : approvalNetworkStatusLabel;
  const approvalCompleted = isApprovalCompleted({
    approvalStatus: approvalTx?.status ?? null,
    networkStatus: approvalNetworkStatus,
    networkResult: approvalTx?.networkResult ?? null
  });
  const canReprepareApproval = approvalNetworkStatus === "EXPIRED";
  const approvalTxJson = approvalTx?.txJson ?? null;
  const approvalTxJsonText = approvalTxJson ? JSON.stringify(approvalTxJson, null, 2) : "";
  const showSignerDetails = shouldShowSignerDetails(approvalTx?.status ?? null);
  const approvalSubmitted = Boolean(
    approvalTx?.status === "SUBMITTED" || approvalSubmittedTxHash
  );
  const signerCompleted = Boolean(
    signerList &&
      Number.isFinite(signerList.signaturesCount) &&
      Number.isFinite(signerList.requiredCount) &&
      signerList.signaturesCount >= signerList.requiredCount
  );
  const nextAction = resolveInheritanceNextAction({
    claimStatus: deathClaim?.claim?.status ?? null,
    caseStage: caseData?.stage ?? null,
    signerStatus: signerList?.status ?? null,
    approvalStatus: approvalTx?.status ?? null,
    signerCompleted
  });
  const nextActionSteps = useMemo(
    () => [
      t("cases.detail.inheritance.steps.adminApproved.title"),
      t("cases.detail.inheritance.steps.preparing.title"),
      t("cases.detail.inheritance.steps.awaitingSign.title"),
      t("cases.detail.inheritance.steps.signerCompleted.title")
    ],
    [t]
  );
  const hasDeathClaim = Boolean(deathClaim?.claim?.claimId);
  const deathClaimStepCompleted =
    hasDeathClaim && (caseData?.stage === "IN_PROGRESS" || caseData?.stage === "COMPLETED");
  const signatureStepCompleted = Boolean(
    signerList?.signedByMe || signerCompleted || approvalCompleted
  );
  const receiveStepCompleted = distribution?.status === "COMPLETED";
  const heirFlowSteps = useMemo(
    () => [
      t("cases.detail.inheritance.flow.steps.wallet"),
      t("cases.detail.inheritance.flow.steps.deathClaim"),
      t("cases.detail.inheritance.flow.steps.signature"),
      t("cases.detail.inheritance.flow.steps.receive")
    ],
    [t]
  );
  const heirFlowStepIndex = resolveHeirFlowStepIndex({
    hasHeirWallet,
    hasDeathClaim: deathClaimStepCompleted,
    hasSignature: signatureStepCompleted,
    hasReceive: receiveStepCompleted
  });
  const heirFlowCurrent = heirFlowStepIndex + 1;
  const heirFlowTotal = heirFlowSteps.length;
  const heirFlowProgressPercent = (heirFlowCurrent / heirFlowTotal) * 100;
  const shouldLockInheritanceFlowByWallet = isHeir && !hasHeirWallet;
  const deathClaimDocumentsHintKey = resolveDeathClaimDocumentsHintKey({
    isHeir,
    hasClaim: Boolean(deathClaim?.claim?.claimId),
    claimStatus: deathClaim?.claim?.status ?? null,
    confirmedByMe: Boolean(deathClaim?.confirmedByMe)
  });
  const shouldShowDeathClaimDocuments = !isHeir || heirFlowStepIndex === 1;
  const shouldShowApprovalSection = !isHeir || heirFlowStepIndex === 2;
  const shouldShowDistributionSection = useMemo(() => {
    if (!isHeir) return true;
    if (heirFlowStepIndex < 3) return false;
    if (distributionLoading || distributionItemsLoading) return true;
    if (!distribution) return true;
    return (distribution.totalCount ?? 0) > 0;
  }, [
    distribution,
    distributionItemsLoading,
    distributionLoading,
    heirFlowStepIndex,
    isHeir
  ]);
  const totalHeirCount = heirs.length;
  const unverifiedHeirCount = heirs.filter((heir) => heir.walletStatus !== "VERIFIED").length;
  const prepareDisabledReason = useMemo(
    () =>
      resolvePrepareDisabledReason({
        caseData,
        signerStatusKey,
        totalHeirCount,
        unverifiedHeirCount,
        approvalTx
      }),
    [caseData, signerStatusKey, totalHeirCount, unverifiedHeirCount, approvalTx]
  );
  const canPollApprovalStatus = useMemo(
    () =>
      shouldPollApprovalStatus({
        isHeir,
        tab,
        caseId,
        canAccessDeathClaims,
        caseStage: caseData?.stage ?? null,
        signerStatus: signerStatusKey,
        approvalStatus: approvalTx?.status ?? null
      }),
    [
      isHeir,
      tab,
      caseId,
      canAccessDeathClaims,
      caseData?.stage,
      signerStatusKey,
      approvalTx?.status
    ]
  );
  const canPrepareApproval = !prepareDisabledReason;
  const distributionStatusLabel = distribution?.status
    ? distributionStatusLabels[distribution.status] ?? distribution.status
    : t("cases.detail.distribution.status.unset");
  const distributionProgress = formatDistributionProgressText(distribution);
  const distributionProgressText = distributionProgress
    ? resolveMessage(distributionProgress)
    : "-";
  const distributionDisabledReason = useMemo(() => {
    return resolveDistributionDisabledReason({
      caseData,
      approvalCompleted,
      totalHeirCount,
      unverifiedHeirCount,
      distribution,
      distributionLoading
    });
  }, [
    caseData,
    approvalCompleted,
    totalHeirCount,
    unverifiedHeirCount,
    distribution,
    distributionLoading
  ]);
  const prepareDisabledText = resolveMessage(prepareDisabledReason);
  const distributionDisabledText = resolveMessage(distributionDisabledReason);
  const signerListErrorText = resolveMessage(
    resolveSignerListErrorMessage(signerList?.error ?? null)
  );
  const nftReceiveItems = useMemo(() => {
    const baseItems = distributionItems.filter(
      (item) => item.type === "NFT" && Boolean(item.offerId)
    );
    if (!user?.uid) return baseItems;
    return baseItems.filter((item) => !item.heirUid || item.heirUid === user.uid);
  }, [distributionItems, user?.uid]);
  const nftReceiveStats = useMemo(() => {
    let success = 0;
    let failed = 0;
    for (const item of nftReceiveItems) {
      const status = nftReceiveResults[item.itemId]?.status ?? "PENDING";
      if (status === "SUCCESS") success += 1;
      if (status === "FAILED") failed += 1;
    }
    return {
      success,
      failed,
      total: nftReceiveItems.length
    };
  }, [nftReceiveItems, nftReceiveResults]);
  const nftReceiveSummary = t("cases.detail.nftReceive.summary", {
    success: nftReceiveStats.success,
    total: nftReceiveStats.total
  });
  const shouldShowNftReceiveSection = nftReceiveItems.length > 0;
  const canExecuteDistribution =
    !distributionDisabledReason && !distributionExecuting;
  const signerDisabledReason = useMemo(() => {
    if (!caseData) return { key: "cases.detail.signer.disabled.noCase" };
    if (caseData.stage !== "IN_PROGRESS") {
      return { key: "cases.detail.signer.disabled.notInProgress" };
    }
    if (signerStatusKey === "FAILED") {
      return { key: "cases.detail.signer.disabled.failed" };
    }
    if (signerStatusKey !== "SET") {
      return { key: "cases.detail.signer.disabled.preparing" };
    }
    if (approvalLoading) {
      return { key: "cases.detail.signer.disabled.loading" };
    }
    if (approvalError) {
      return { key: "cases.detail.signer.disabled.loadFailed" };
    }
    if (!approvalTx?.txJson) {
      return { key: "cases.detail.signer.disabled.notGenerated" };
    }
    if (approvalTx.status === "FAILED") {
      return { key: "cases.detail.signer.disabled.prepareFailed" };
    }
    if (approvalTx.status === "SUBMITTED") {
      if (approvalNetworkStatus === "EXPIRED") {
        return { key: "cases.detail.signer.disabled.expired" };
      }
      const networkLabel =
        approvalNetworkStatusLabel && approvalNetworkStatusLabel !== "-"
          ? `（${approvalNetworkStatusLabel}）`
          : "";
      return {
        key: "cases.detail.signer.disabled.submitted",
        values: { network: networkLabel }
      };
    }
    if (!hasHeirWallet) {
      return { key: "cases.detail.signer.disabled.walletRequired" };
    }
    if (!isHeirWalletVerified) {
      return { key: "cases.detail.signer.disabled.walletVerifyRequired" };
    }
    if (signerList?.signedByMe) {
      return { key: "cases.detail.signer.disabled.signed" };
    }
    if (signerCompleted) {
      return { key: "cases.detail.signer.disabled.completed" };
    }
    return null;
  }, [
    caseData,
    signerStatusKey,
    approvalLoading,
    approvalError,
    approvalTx?.txJson,
    approvalTx?.status,
    hasHeirWallet,
    isHeirWalletVerified,
    signerCompleted,
    signerList?.signedByMe,
    approvalNetworkStatusLabel,
    approvalNetworkStatus
  ]);
  const signerDisabledText = resolveMessage(signerDisabledReason);
  const canSubmitSignature =
    !signerDisabledReason &&
    !signerSubmitting &&
    !signerSigning &&
    signerSignedBlob.trim().length > 0;

  useEffect(() => {
    let active = true;
    if (!caseId) {
      if (active) {
        setError("cases.detail.error.caseIdMissing");
        setLoading(false);
      }
      return;
    }
    const load = async () => {
      try {
        const detail = await getCase(caseId);
        if (!active) return;
        setCaseData(detail);
        const owner = detail.ownerUid === user?.uid;
        setIsOwner(owner);
        if (owner) {
          setOwnerDistributionWalletAddress(null);
          const [assetItems, planItems, inviteItems] = await Promise.all([
            listAssets(caseId),
            listPlans(caseId),
            listInvitesByOwner(caseId)
          ]);
          if (!active) return;
          setAssets(assetItems);
          setPlans(planItems);
          setOwnerInvites(inviteItems);
          setHeirs([]);
          setHeirWallet(null);
          try {
            const lockState = await getAssetLock(caseId);
            if (active) {
              setOwnerDistributionWalletAddress(lockState.wallet?.address ?? null);
            }
          } catch {
            if (active) {
              setOwnerDistributionWalletAddress(null);
            }
          }
        } else {
          const [planItems, heirItems] = await Promise.all([
            listPlans(caseId),
            listCaseHeirs(caseId)
          ]);
          if (!active) return;
          setAssets([]);
          setPlans(planItems);
          setOwnerInvites([]);
          setHeirs(heirItems);
          setOwnerDistributionWalletAddress(null);
          setHeirWalletLoading(true);
          setHeirWalletError(null);
          try {
            const wallet = await getHeirWallet(caseId);
            if (active) {
              setHeirWallet(wallet);
              setHeirWalletAddressInput(wallet?.address ?? "");
            }
          } catch (err: any) {
            if (active) {
              setHeirWalletError(err?.message ?? "cases.detail.wallet.error.loadFailed");
            }
          } finally {
            if (active) {
              setHeirWalletLoading(false);
            }
          }
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message ?? "cases.detail.error.loadFailed");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [caseId, user?.uid]);

  useEffect(() => {
    if (isTabKey(queryTab) && availableTabKeys.includes(queryTab) && queryTab !== tab) {
      setTab(queryTab);
    } else if (queryTab && !availableTabKeys.includes(queryTab as TabKey)) {
      setTab(availableTabKeys[0] ?? "assets");
    }
  }, [queryTab, tab, availableTabKeys]);

  useEffect(() => {
    if (!availableTabKeys.includes(tab)) {
      setTab(availableTabKeys[0] ?? "assets");
    }
  }, [availableTabKeys, tab]);

  useEffect(() => {
    if (heirWallet?.address) {
      setHeirWalletAddressInput(heirWallet.address);
    }
  }, [heirWallet?.address]);

  const fetchSignerList = useCallback(async () => {
    if (!caseId) return;
    setSignerLoading(true);
    setSignerError(null);
    try {
      const data = await getSignerList(caseId);
      setSignerList(data);
    } catch (err: any) {
      setSignerError(err?.message ?? "cases.detail.signer.error.statusLoadFailed");
    } finally {
      setSignerLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    if (!isHeir || tab !== "death-claims" || !caseId || !canAccessDeathClaims) {
      return;
    }
    void fetchSignerList();
  }, [isHeir, tab, caseId, canAccessDeathClaims, fetchSignerList]);

  const fetchApprovalTx = useCallback(async () => {
    if (!caseId) return;
    setApprovalLoading(true);
    setApprovalError(null);
    try {
      const data = await getApprovalTx(caseId);
      setApprovalTx(data);
    } catch (err: any) {
      const message = resolveApprovalTxErrorMessage(err);
      if (!message) {
        setApprovalTx(null);
        setApprovalError(null);
        return;
      }
      setApprovalError(message);
    } finally {
      setApprovalLoading(false);
    }
  }, [caseId]);

  const fetchDistributionState = useCallback(async () => {
    if (!caseId) return;
    setDistributionLoading(true);
    setDistributionError(null);
    try {
      const data = await getDistributionState(caseId);
      setDistribution(data);
    } catch (err: any) {
      setDistributionError(err?.message ?? "cases.detail.distribution.error.loadFailed");
    } finally {
      setDistributionLoading(false);
    }
  }, [caseId]);

  const fetchDistributionItems = useCallback(async () => {
    if (!caseId) return;
    setDistributionItemsLoading(true);
    setDistributionItemsError(null);
    try {
      const data = await listDistributionItems(caseId);
      setDistributionItems(data);
    } catch (err: any) {
      setDistributionItemsError(err?.message ?? "cases.detail.nftReceive.error.loadFailed");
    } finally {
      setDistributionItemsLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    if (
      !shouldFetchApprovalTx({
        isHeir,
        tab,
        caseId,
        canAccessDeathClaims,
        caseStage: caseData?.stage ?? null,
        signerStatus: signerList?.status ?? null
      })
    ) {
      return;
    }
    void fetchApprovalTx();
  }, [
    isHeir,
    tab,
    caseId,
    canAccessDeathClaims,
    caseData?.stage,
    signerList?.status,
    fetchApprovalTx
  ]);

  useEffect(() => {
    if (!isHeir || tab !== "death-claims" || !caseId || !canAccessDeathClaims) {
      return;
    }
    if (caseData?.stage !== "IN_PROGRESS") return;
    void fetchDistributionState();
  }, [
    isHeir,
    tab,
    caseId,
    canAccessDeathClaims,
    caseData?.stage,
    fetchDistributionState
  ]);

  useEffect(() => {
    if (!isHeir || tab !== "death-claims" || !caseId || !canAccessDeathClaims) {
      return;
    }
    if (caseData?.stage !== "IN_PROGRESS") return;
    void fetchDistributionItems();
  }, [
    isHeir,
    tab,
    caseId,
    canAccessDeathClaims,
    caseData?.stage,
    distribution?.status,
    fetchDistributionItems
  ]);

  useEffect(() => {
    setNftReceiveResults({});
    setNftReceiveError(null);
  }, [caseId]);

  useEffect(() => {
    if (!canPollApprovalStatus) return;
    const intervalId = window.setInterval(() => {
      void fetchApprovalTx();
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [canPollApprovalStatus, fetchApprovalTx]);

  useEffect(() => {
    if (distribution?.status !== "RUNNING") return;
    const intervalId = window.setInterval(() => {
      void fetchDistributionState();
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [distribution?.status, fetchDistributionState]);

  const handlePrepareApproval = async () => {
    if (!caseId) return;
    setPrepareLoading(true);
    setPrepareError(null);
    setPrepareSuccess(null);
    try {
      await prepareApprovalTx(caseId);
      setPrepareSuccess("cases.detail.signer.prepare.success");
      setSignerSignedBlob("");
      autoSignKeyRef.current = "";
      await fetchSignerList();
      await fetchApprovalTx();
    } catch (err: any) {
      const code = err?.data?.code;
      if (code === "HEIR_WALLET_UNVERIFIED" || code === "WALLET_NOT_VERIFIED") {
        setPrepareError("cases.detail.prepare.disabled.unverified");
      } else if (code === "HEIR_MISSING") {
        setPrepareError("cases.detail.prepare.disabled.noHeirs");
      } else if (code === "NOT_READY") {
        setPrepareError("cases.detail.prepare.disabled.notInProgress");
      } else {
        setPrepareError(err?.message ?? "cases.detail.signer.prepare.error.failed");
      }
    } finally {
      setPrepareLoading(false);
    }
  };

  const handleReprepareApproval = async () => {
    if (!caseId) return;
    setPrepareLoading(true);
    setPrepareError(null);
    setPrepareSuccess(null);
    try {
      await prepareApprovalTx(caseId, { force: true });
      setPrepareSuccess("cases.detail.signer.prepare.reprepareSuccess");
      setSignerSignedBlob("");
      autoSignKeyRef.current = "";
      await fetchSignerList();
      await fetchApprovalTx();
    } catch (err: any) {
      const code = err?.data?.code;
      if (code === "HEIR_WALLET_UNVERIFIED" || code === "WALLET_NOT_VERIFIED") {
        setPrepareError("cases.detail.prepare.disabled.unverified");
      } else if (code === "HEIR_MISSING") {
        setPrepareError("cases.detail.prepare.disabled.noHeirs");
      } else if (code === "NOT_READY") {
        setPrepareError("cases.detail.signer.prepare.error.submitted");
      } else {
        setPrepareError(err?.message ?? "cases.detail.signer.prepare.error.reprepareFailed");
      }
    } finally {
      setPrepareLoading(false);
    }
  };

  const handleExecuteDistribution = async () => {
    if (!caseId) return;
    setDistributionExecuting(true);
    setDistributionError(null);
    try {
      const data = await executeDistribution(caseId);
      setDistribution(data);
    } catch (err: any) {
      setDistributionError(err?.message ?? "cases.detail.distribution.error.executeFailed");
    } finally {
      setDistributionExecuting(false);
    }
  };

  const handleAcceptNftOffers = async () => {
    if (!caseId) return;
    const seed = nftReceiveSeed.trim();
    if (!seed) {
      setNftReceiveError("cases.detail.nftReceive.error.seedRequired");
      return;
    }
    if (!heirWallet?.address) {
      setNftReceiveError("cases.detail.nftReceive.error.walletRequired");
      return;
    }
    if (nftReceiveItems.length === 0) {
      setNftReceiveError(null);
      return;
    }
    setNftReceiveExecuting(true);
    setNftReceiveError(null);
    for (const item of nftReceiveItems) {
      const offerId = item.offerId;
      if (!offerId) continue;
      try {
        await acceptNftSellOffer({
          buyerSeed: seed,
          buyerAddress: heirWallet.address,
          offerId
        });
        setNftReceiveResults((prev) => ({
          ...prev,
          [item.itemId]: { status: "SUCCESS", error: null }
        }));
      } catch (err: any) {
        setNftReceiveResults((prev) => ({
          ...prev,
          [item.itemId]: {
            status: "FAILED",
            error: err?.message ?? "cases.detail.nftReceive.error.acceptFailed"
          }
        }));
      }
    }
    setNftReceiveExecuting(false);
  };

  const handleSaveHeirWallet = async () => {
    if (!caseId) return;
    const address = heirWalletAddressInput.trim();
    if (!address) {
      setHeirWalletError("cases.detail.wallet.error.addressRequired");
      return;
    }
    setHeirWalletSaving(true);
    setHeirWalletError(null);
    setHeirWalletVerifySuccess(null);
    try {
      await saveHeirWallet(caseId, address);
      const wallet = await getHeirWallet(caseId);
      setHeirWallet(wallet);
      setHeirWalletChallenge(null);
    } catch (err: any) {
      setHeirWalletError(err?.message ?? "cases.detail.wallet.error.saveFailed");
    } finally {
      setHeirWalletSaving(false);
    }
  };

  const handleRequestHeirWalletChallenge = async () => {
    if (!caseId) return;
    setHeirWalletVerifyError(null);
    setHeirWalletVerifySuccess(null);
    setHeirWalletSecret("");
    setHeirWalletVerifyLoading(true);
    try {
      const result = await requestHeirWalletVerifyChallenge(caseId);
      setHeirWalletChallenge(result);
    } catch (err: any) {
      setHeirWalletVerifyError(err?.message ?? "cases.detail.wallet.error.challengeFailed");
    } finally {
      setHeirWalletVerifyLoading(false);
    }
  };

  const handleCopy = async (label: string, value: string) => {
    const result = await copyText(label, value);
    setCopyMessage(t(result.messageKey, result.values));
    if (result.ok) {
      window.setTimeout(() => setCopyMessage(null), 1500);
    }
  };

  const handleAutoVerifyHeirWallet = async () => {
    if (!caseId) {
      setHeirWalletVerifyError("cases.detail.wallet.error.caseIdMissing");
      return;
    }
    if (!heirWallet?.address) {
      setHeirWalletVerifyError("cases.detail.wallet.error.addressMissing");
      return;
    }
    setHeirWalletVerifyError(null);
    setHeirWalletVerifySuccess(null);
    setHeirWalletSending(true);
    try {
      const result = await autoVerifyWalletOwnership(
        {
          walletAddress: heirWallet.address,
          secret: heirWalletSecret,
          challenge: heirWalletChallenge
        },
        {
          requestChallenge: () => requestHeirWalletVerifyChallenge(caseId),
          createPaymentTx,
          signSingle,
          submitSignedBlob,
          confirmVerify: (txHash) => confirmHeirWalletVerify(caseId, txHash)
        }
      );
      setHeirWalletChallenge(result.challenge);
      setHeirWalletSecret("");
      const wallet = await getHeirWallet(caseId);
      setHeirWallet(wallet);
      setHeirWalletVerifySuccess("cases.detail.wallet.verify.success");
      if (shouldCloseWalletDialogOnVerify(wallet?.verificationStatus === "VERIFIED")) {
        setWalletDialogOpen(false);
      }
    } catch (err: any) {
      setHeirWalletVerifyError(err?.message ?? "cases.detail.wallet.verify.error");
    } finally {
      setHeirWalletSending(false);
    }
  };

  const signApprovalTx = useCallback(
    (secret: string) => {
      if (!approvalTx?.txJson) {
        setSignerError("cases.detail.signer.error.txMissing");
        return false;
      }
      setSignerSigning(true);
      setSignerError(null);
      try {
        const result = signForMultisign(approvalTx.txJson, secret);
        setSignerSignedBlob(result.blob);
        return true;
      } catch (err: any) {
        setSignerSignedBlob("");
        setSignerError(err?.message ?? "cases.detail.signer.error.signFailed");
        return false;
      } finally {
        setSignerSigning(false);
      }
    },
    [approvalTx?.txJson]
  );

  useEffect(() => {
    if (!approvalTx?.txJson || signerDisabledReason !== null || signerList?.signedByMe) {
      autoSignKeyRef.current = "";
      setSignerSignedBlob("");
      return;
    }
    if (signerSigning || signerSubmitting) {
      return;
    }
    const secret = signerSeed.trim();
    if (!secret) {
      autoSignKeyRef.current = "";
      setSignerSignedBlob("");
      return;
    }
    const autoSignKey = `${secret}::${approvalTxJsonText}`;
    if (autoSignKeyRef.current === autoSignKey) {
      return;
    }
    autoSignKeyRef.current = autoSignKey;
    const ok = signApprovalTx(secret);
    if (!ok) {
      autoSignKeyRef.current = "";
    }
  }, [
    approvalTx?.txJson,
    approvalTxJsonText,
    signerDisabledReason,
    signerList?.signedByMe,
    signerSeed,
    signerSigning,
    signerSubmitting,
    signApprovalTx
  ]);

  const handleSubmitSignerSignature = async () => {
    if (!caseId) return;
    const signedBlob = signerSignedBlob.trim();
    if (!signedBlob) {
      setSignerError("cases.detail.signer.error.signedBlobRequired");
      return;
    }
    setSignerSubmitting(true);
    setSignerError(null);
    try {
      const result = await submitSignerSignature(caseId, signedBlob);
      setSignerList((prev) => ({
        status: prev?.status ?? "SET",
        quorum: prev?.quorum ?? null,
        error: prev?.error ?? null,
        signaturesCount: result.signaturesCount,
        requiredCount: result.requiredCount,
        signedByMe: result.signedByMe
      }));
      setSignerSignedBlob("");
      setSignerSeed("");
      void fetchApprovalTx();
    } catch (err: any) {
      setSignerError(err?.message ?? "cases.detail.signer.error.submitFailed");
    } finally {
      setSignerSubmitting(false);
    }
  };

  useEffect(() => {
    if (
      !shouldAutoRequestChallenge({
        isOpen: walletDialogOpen,
        mode: walletDialogMode,
        hasWallet: hasHeirWallet,
        hasChallenge: Boolean(heirWalletChallenge),
        isLoading: heirWalletVerifyLoading,
        isVerified: isHeirWalletVerified
      })
    ) {
      return;
    }
    void handleRequestHeirWalletChallenge();
  }, [
    walletDialogOpen,
    walletDialogMode,
    hasHeirWallet,
    heirWalletChallenge,
    heirWalletVerifyLoading
  ]);

  const handleOpenWalletDialog = (mode: "register" | "verify") => {
    setWalletDialogMode(mode);
    setWalletDialogOpen(true);
  };

  const handleTabChange = (value: string) => {
    const nextTab = value as TabKey;
    setTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", nextTab);
    setSearchParams(nextParams, { replace: true });
  };

  const handleOpenInviteModal = () => {
    setInviteModalOpen(true);
  };

  const handleOpenInviteEdit = (invite: InviteListItem) => {
    const normalizedRelation = toRelationOption(invite.relationLabel);
    setInviteEditRelation(normalizedRelation);
    setInviteEditRelationOther(
      normalizedRelation === relationOtherValue
        ? (invite.relationOther?.trim() || invite.relationLabel || "")
        : (invite.relationOther ?? "")
    );
    setInviteEditMemo(invite.memo ?? "");
    setEditingInvite(invite);
  };

  const handleInviteSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLocked) return;
    if (!caseId) {
      setError("cases.detail.error.caseIdMissing");
      return;
    }
    setError(null);
    setInviting(true);
    try {
      await createInvite(caseId, {
        email: inviteEmail,
        relationLabel: inviteRelation,
        relationOther: inviteRelation === relationOtherValue ? inviteRelationOther : undefined,
        memo: inviteMemo.trim() ? inviteMemo : undefined
      });
      setInviteEmail("");
      setInviteRelation(relationOptions[0]);
      setInviteRelationOther("");
      setInviteMemo("");
      const inviteItems = await listInvitesByOwner(caseId);
      setOwnerInvites(inviteItems);
      setInviteModalOpen(false);
    } catch (err: any) {
      setError(err?.message ?? "cases.detail.heirs.invite.error.sendFailed");
    } finally {
      setInviting(false);
    }
  };

  const handleInviteUpdateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLocked) return;
    if (!caseId) {
      setError("cases.detail.error.caseIdMissing");
      return;
    }
    if (!editingInvite) return;
    setError(null);
    setInviteUpdating(true);
    try {
      await updateInvite(caseId, editingInvite.inviteId, {
        relationLabel: inviteEditRelation,
        relationOther:
          inviteEditRelation === relationOtherValue ? inviteEditRelationOther : undefined,
        memo: inviteEditMemo.trim() ? inviteEditMemo : undefined
      });
      const inviteItems = await listInvitesByOwner(caseId);
      setOwnerInvites(inviteItems);
      setEditingInvite(null);
      setInviteEditRelation(relationOptions[0]);
      setInviteEditRelationOther("");
      setInviteEditMemo("");
    } catch (err: any) {
      setError(err?.message ?? "cases.detail.heirs.invites.error.updateFailed");
    } finally {
      setInviteUpdating(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: t("nav.cases"), href: "/cases" },
            { label: title }
          ]}
        />
        <div className={styles.headerRow}>
          <div className={styles.headerMain}>
            <h1 className="text-title">{title}</h1>
            {caseData ? (
              <div className={styles.headerMeta}>
                <span className={styles.statusBadge}>
                  {caseStatusLabels[caseData.stage] ?? caseData.stage}
                </span>
                <span className={styles.metaText}>
                  {t("cases.detail.updatedAt", { date: formatDate(caseData.updatedAt) })}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{t(error)}</FormAlert> : null}

      {showOwnerDistributionWallet ? (
        <div className={styles.walletSection}>
          <div className={styles.walletRow}>
            <span className={styles.walletLabel}>
              {t("cases.detail.distributionWallet.title")}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className={styles.copyButton}
              onClick={() =>
                handleCopy(
                  t("cases.detail.distributionWallet.copyLabel"),
                  ownerDistributionWalletAddress ?? ""
                )
              }
              aria-label={t("cases.detail.distributionWallet.copyAriaLabel")}
              disabled={!ownerDistributionWalletAddress}
            >
              <Copy />
            </Button>
          </div>
          <div className={styles.walletAddress}>
            <div className={styles.walletAddressValue}>
              {ownerDistributionWalletAddress ??
                t("cases.detail.distributionWallet.empty")}
            </div>
          </div>
          {copyMessage ? <FormAlert variant="info">{copyMessage}</FormAlert> : null}
        </div>
      ) : null}

      <Tabs items={tabItems} value={tab} onChange={handleTabChange} />

      {tab === "assets" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{t("cases.detail.assets.title")}</h2>
            {caseId && isOwner && !isLocked ? (
              <div className={styles.panelActions}>
                <Button asChild size="sm" variant="secondary">
                  <Link to={`/cases/${caseId}/asset-lock`}>
                    {t("cases.detail.assets.actions.lock")}
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link to={`/cases/${caseId}/assets/new`}>
                    {t("cases.detail.assets.actions.add")}
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
          {loading ? null : isOwner === false ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>
                {t("cases.detail.assets.empty.heirOnly.title")}
              </div>
              <div className={styles.emptyBody}>
                {t("cases.detail.assets.empty.heirOnly.body")}
              </div>
            </div>
          ) : assets.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>
                {t("cases.detail.assets.empty.none.title")}
              </div>
              <div className={styles.emptyBody}>
                {t("cases.detail.assets.empty.none.body")}
              </div>
            </div>
          ) : (
            <div className={styles.list}>
              {assets.map((asset) => (
                <AssetRow key={asset.assetId} caseId={caseId} asset={asset} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "plans" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{t("cases.detail.plans.title")}</h2>
            {caseId && isOwner && !isLocked ? (
              <Button asChild size="sm">
                <Link to={`/cases/${caseId}/plans/new`}>
                  {t("cases.detail.plans.actions.create")}
                </Link>
              </Button>
            ) : null}
          </div>
          {loading ? null : plans.length === 0 ? (
            <div className={styles.emptyState}>
              {isOwner === false ? (
                <>
                  <div className={styles.emptyTitle}>
                    {t("cases.detail.plans.empty.heir.title")}
                  </div>
                  <div className={styles.emptyBody}>
                    {t("cases.detail.plans.empty.heir.body")}
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.emptyTitle}>
                    {t("cases.detail.plans.empty.owner.title")}
                  </div>
                  <div className={styles.emptyBody}>
                    {t("cases.detail.plans.empty.owner.body")}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className={styles.list}>
              {plans.map((plan) => (
                <Link
                  key={plan.planId}
                  to={`/cases/${caseId}/plans/${plan.planId}`}
                  className={styles.rowLink}
                >
                  <div className={styles.row}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>{plan.title}</div>
                      <div className={styles.rowMetaStack}>
                        <div className={styles.rowMeta}>
                          {t("cases.detail.plans.assetCount", {
                            count: plan.assetCount ?? 0
                          })}
                        </div>
                        <div className={styles.rowMeta}>
                          {t("cases.detail.plans.heirCount", {
                            count: plan.heirCount ?? 0
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "death-claims" ? (
        loading && !caseData ? (
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>{t("cases.detail.deathClaims.title")}</h2>
            </div>
            <div className={styles.muted}>{t("common.loading")}</div>
          </div>
        ) : !caseData ? (
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>{t("cases.detail.deathClaims.title")}</h2>
            </div>
            <div className={styles.muted}>{t("cases.detail.error.noCase")}</div>
          </div>
        ) : canAccessDeathClaims ? (
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>{t("cases.detail.deathClaims.title")}</h2>
            </div>
            {nextAction && !isHeir ? (
              <div className={styles.nextAction}>
                <div className={styles.nextActionTitle}>
                  {t("cases.detail.deathClaims.nextAction.title")}
                </div>
                <div className={styles.nextActionSteps}>
                  {nextActionSteps.map((label, index) => (
                    <span
                      key={label}
                      className={`${styles.nextActionStep} ${
                        index === nextAction.stepIndex ? styles.nextActionStepActive : ""
                      }`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <div className={styles.nextActionBody}>
                  {t(nextAction.descriptionKey)}
                </div>
              </div>
            ) : null}
            {isHeir ? (
              <div className={styles.nextAction}>
                <div className={styles.heirStepperHeader}>
                  <div className={styles.nextActionTitle}>
                    {t("cases.detail.inheritance.flow.title")}
                  </div>
                  <div className={styles.heirStepperCount}>
                    {t("cases.detail.inheritance.flow.progress", {
                      current: heirFlowCurrent,
                      total: heirFlowTotal
                    })}
                  </div>
                </div>
                <div className={styles.heirStepperTrack} aria-hidden="true">
                  <div
                    className={styles.heirStepperFill}
                    style={{ width: `${heirFlowProgressPercent}%` }}
                  />
                </div>
                <ol className={styles.heirStepperList}>
                  {heirFlowSteps.map((label, index) => (
                    <li
                      key={label}
                      className={`${styles.heirStepperItem} ${
                        index < heirFlowStepIndex ? styles.heirStepperItemDone : ""
                      } ${index === heirFlowStepIndex ? styles.heirStepperItemActive : ""}`}
                    >
                      <span
                        className={`${styles.heirStepperNumber} ${
                          index <= heirFlowStepIndex ? styles.heirStepperNumberActive : ""
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span
                        className={`${styles.heirStepperLabel} ${
                          index === heirFlowStepIndex ? styles.heirStepperLabelActive : ""
                        }`}
                      >
                        {label}
                      </span>
                    </li>
                  ))}
                </ol>
                <div className={styles.nextActionBody}>
                  {t("cases.detail.inheritance.flow.stepLabel", {
                    current: heirFlowCurrent,
                    total: heirFlowTotal,
                    step: heirFlowSteps[heirFlowStepIndex] ?? "-"
                  })}
                </div>
                <div className={styles.nextActionSteps}>
                  {heirFlowSteps.map((label, index) => (
                    <span
                      key={`${label}-chip`}
                      className={`${styles.nextActionStep} ${
                        index === heirFlowStepIndex ? styles.nextActionStepActive : ""
                      }`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {shouldLockInheritanceFlowByWallet ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyTitle}>
                  {t("cases.detail.inheritance.flow.walletGate.title")}
                </div>
                <div className={styles.emptyBody}>
                  {t("cases.detail.inheritance.flow.walletGate.body")}
                </div>
                <div className={styles.panelActions}>
                  <Button type="button" onClick={() => handleTabChange("wallet")}>
                    {t("cases.detail.inheritance.flow.walletGate.action")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {shouldShowDeathClaimDocuments ? (
                  <div className={styles.collapsible}>
                    <div className={styles.collapsibleBody}>
                      <div className={styles.collapsibleText}>
                        <div className={styles.collapsibleTitle}>
                          {t("cases.detail.deathClaims.documents.title")}
                        </div>
                        <div className={styles.collapsibleHint}>
                          {t(deathClaimDocumentsHintKey)}
                        </div>
                      </div>
                      <DeathClaimsPanel
                        initialClaim={initialDeathClaim ?? null}
                        onClaimChange={setDeathClaim}
                      />
                    </div>
                  </div>
                ) : null}
                {shouldShowApprovalSection ? (
                  <div className={styles.signerSection}>
                    <div className={styles.signerHeader}>
                      <div className={styles.signerHeaderMain}>
                        <div className={styles.signerTitle}>
                          {t("cases.detail.deathClaims.approval.title")}
                        </div>
                        <div className={styles.signerHint}>
                          {t("cases.detail.deathClaims.approval.hint")}
                        </div>
                      </div>
                      <span className={styles.signerBadge}>{signerStatusLabel}</span>
                    </div>
              {signerError ? <FormAlert variant="error">{t(signerError)}</FormAlert> : null}
              {approvalError ? (
                <FormAlert variant="error">{t(approvalError)}</FormAlert>
              ) : null}
              {prepareError ? <FormAlert variant="error">{t(prepareError)}</FormAlert> : null}
              {prepareSuccess ? (
                <FormAlert variant="success">{t(prepareSuccess)}</FormAlert>
              ) : null}
              {signerListErrorText ? <FormAlert variant="error">{signerListErrorText}</FormAlert> : null}
              <div className={styles.signerGrid}>
                <div className={styles.signerRow}>
                  <div className={styles.signerLabel}>
                    {t("cases.detail.signer.status.label")}
                  </div>
                  <div className={styles.signerValue}>
                    {signerLoading
                      ? t("common.loading")
                      : signerList
                        ? t("cases.detail.signer.status.count", {
                            signed: signerList.signaturesCount,
                            required: signerList.requiredCount
                          })
                        : "-"}
                  </div>
                </div>
                <div className={styles.signerRow}>
                  <div className={styles.signerLabel}>
                    {t("cases.detail.signer.mySignature.label")}
                  </div>
                  <div className={styles.signerValue}>
                    {signerList?.signedByMe
                      ? t("cases.detail.signer.mySignature.signed")
                      : t("cases.detail.signer.mySignature.unsigned")}
                  </div>
                </div>
                {approvalCompleted ? (
                  <div className={styles.signerRow}>
                    <div className={styles.signerLabel}>
                      {t("cases.detail.signer.inheritance.label")}
                    </div>
                    <div className={styles.signerValue}>
                      {t("cases.detail.signer.inheritance.completed")}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className={styles.signerGuide}>
                <div className={styles.signerGuideTitle}>{t("cases.detail.signer.guide.title")}</div>
                <ol className={styles.signerGuideList}>
                  <li>{t("cases.detail.signer.guide.steps.tx")}</li>
                  <li>{t("cases.detail.signer.guide.steps.secret")}</li>
                  <li>{t("cases.detail.signer.guide.steps.submit")}</li>
                  <li>{t("cases.detail.signer.guide.steps.autoExecute")}</li>
                </ol>
              </div>
              {showSignerDetails ? (
                <div className={styles.signerTxSection}>
                  <div className={styles.signerTxHeader}>
                    <div className={styles.signerTxHeaderMain}>
                      <div className={styles.signerTxTitle}>
                        {t("cases.detail.signer.tx.title")}
                      </div>
                      <div className={styles.signerTxHint}>
                        {t("cases.detail.signer.tx.hint")}
                      </div>
                    </div>
                    <span className={styles.signerTxBadge}>{approvalStatusLabel}</span>
                  </div>
                  {approvalSubmitted ? (
                    <div className={styles.signerTxStatus}>
                      <div className={styles.signerTxRow}>
                        <div>
                          <div className={styles.signerTxLabel}>
                            {t("cases.detail.signer.tx.sentLabel")}
                          </div>
                          <div className={styles.signerTxValue}>
                            {approvalSubmittedTxHash || "-"}
                          </div>
                        </div>
                      </div>
                      <div className={styles.signerTxRow}>
                        <div>
                          <div className={styles.signerTxLabel}>
                            {t("cases.detail.signer.tx.afterLabel")}
                          </div>
                          <div className={styles.signerTxValue}>
                            {approvalNetworkDetail}
                          </div>
                        </div>
                        {canReprepareApproval ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleReprepareApproval}
                            disabled={prepareLoading}
                          >
                            {t("cases.detail.signer.tx.actions.reprepare")}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void fetchApprovalTx()}
                          disabled={approvalLoading || !canPollApprovalStatus}
                        >
                          {t("cases.detail.signer.tx.actions.reload")}
                        </Button>
                      </div>
                      <div className={styles.signerTxNote}>
                        {canReprepareApproval
                          ? t("cases.detail.signer.tx.note.expired")
                          : t("cases.detail.signer.tx.note.refresh")}
                      </div>
                    </div>
                  ) : null}
                  {approvalLoading ? (
                    <div className={styles.muted}>{t("cases.detail.signer.tx.loading")}</div>
                  ) : null}
                  {approvalTxJson ? (
                    <div className={styles.collapsible}>
                      <div className={styles.collapsibleBody}>
                        <div className={styles.collapsibleText}>
                          <div className={styles.collapsibleTitle}>
                            {t("cases.detail.signer.tx.details.title")}
                          </div>
                        </div>
                        <div className={styles.signerTxGrid}>
                          <div className={styles.signerTxRow}>
                            <div>
                              <div className={styles.signerTxLabel}>
                                {t("cases.detail.signer.tx.memoLabel")}
                              </div>
                              <div className={styles.signerTxValue}>
                                {approvalTx?.memo ?? "-"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.muted}>{t("cases.detail.signer.tx.empty")}</div>
                  )}
                </div>
              ) : (
                <div className={styles.signerTxSection}>
                  <div className={styles.signerTxHeader}>
                    <div className={styles.signerTxHeaderMain}>
                      <div className={styles.signerTxTitle}>
                        {t("cases.detail.signer.tx.afterTitle")}
                      </div>
                      <div className={styles.signerTxHint}>
                        {t("cases.detail.signer.tx.afterHint")}
                      </div>
                    </div>
                    <span className={styles.signerTxBadge}>{approvalStatusLabel}</span>
                  </div>
                  <div className={styles.signerTxStatus}>
                    <div className={styles.signerTxRow}>
                      <div>
                        <div className={styles.signerTxLabel}>
                          {t("cases.detail.signer.tx.sentLabel")}
                        </div>
                        <div className={styles.signerTxValue}>
                          {approvalSubmittedTxHash || "-"}
                        </div>
                      </div>
                    </div>
                    <div className={styles.signerTxRow}>
                      <div>
                        <div className={styles.signerTxLabel}>
                          {t("cases.detail.signer.tx.afterLabel")}
                        </div>
                        <div className={styles.signerTxValue}>
                          {approvalNetworkDetail}
                        </div>
                      </div>
                      {canReprepareApproval ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleReprepareApproval}
                          disabled={prepareLoading}
                        >
                          {t("cases.detail.signer.tx.actions.reprepare")}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void fetchApprovalTx()}
                        disabled={approvalLoading || !canPollApprovalStatus}
                      >
                        {t("cases.detail.signer.tx.actions.reload")}
                      </Button>
                    </div>
                    <div className={styles.signerTxNote}>
                      {canReprepareApproval
                        ? t("cases.detail.signer.tx.note.expired")
                        : t("cases.detail.signer.tx.note.refresh")}
                    </div>
                  </div>
                </div>
              )}
              {shouldShowSignerActions(approvalTx?.status ?? null) ? (
                <div className={styles.signerActionPanel} data-testid="signer-action-panel">
                  {approvalTxJson ? (
                    <>
                      <FormField label={t("cases.detail.signer.secret.label")}>
                        <Input
                          value={signerSeed}
                          onChange={(event) => setSignerSeed(event.target.value)}
                          placeholder="s..."
                          type="password"
                          disabled={signerDisabledReason !== null}
                        />
                      </FormField>
                      <div className={styles.signerAutoNote}>
                        {signerSigning
                          ? t("cases.detail.signer.autoNote.signing")
                          : signerSignedBlob
                            ? t("cases.detail.signer.autoNote.ready")
                            : t("cases.detail.signer.autoNote.hint")}
                      </div>
                      <div className={styles.signerActionRow}>
                        <Button
                          type="button"
                          onClick={handleSubmitSignerSignature}
                          disabled={!canSubmitSignature}
                        >
                          {signerSubmitting
                            ? t("cases.detail.signer.actions.submitting")
                            : t("cases.detail.signer.actions.submit")}
                        </Button>
                      </div>
                      <div className={styles.signerSecretNote}>
                        {t("cases.detail.signer.secret.note")}
                      </div>
                      {signerDisabledText ? (
                        <div className={styles.signerNote}>{signerDisabledText}</div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className={styles.signerPrepareTitle}>
                        {t("cases.detail.signer.prepare.title")}
                      </div>
                      <div className={styles.signerPrepareHint}>
                        {t("cases.detail.signer.prepare.hint")}
                      </div>
                      <div className={styles.signerPrepareActions}>
                        <Button
                          type="button"
                          onClick={handlePrepareApproval}
                          disabled={!canPrepareApproval || prepareLoading}
                        >
                          {prepareLoading
                            ? t("cases.detail.signer.prepare.loading")
                            : t("cases.detail.signer.prepare.action")}
                        </Button>
                      </div>
                      {prepareDisabledText ? (
                        <div className={styles.signerPrepareNote}>{prepareDisabledText}</div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
              {!approvalTxJson && signerDisabledText ? (
                <div className={styles.signerNote}>{signerDisabledText}</div>
              ) : null}
                  </div>
                ) : null}
                {shouldShowDistributionSection ? (
                  <div className={styles.distributionSection}>
              <div className={styles.distributionHeader}>
                <div className={styles.distributionHeaderMain}>
                  <div className={styles.distributionTitle}>
                    {t("cases.detail.distribution.title")}
                  </div>
                  <div className={styles.distributionHint}>
                    {t("cases.detail.distribution.hint")}
                  </div>
                </div>
                <span className={styles.distributionBadge}>{distributionStatusLabel}</span>
              </div>
              {distributionError ? (
                <FormAlert variant="error">{t(distributionError)}</FormAlert>
              ) : null}
              <div className={styles.signerGrid}>
                <div className={styles.signerRow}>
                  <div className={styles.signerLabel}>
                    {t("cases.detail.distribution.labels.success")}
                  </div>
                  <div className={styles.signerValue}>
                    {distributionProgressText}
                  </div>
                </div>
                <div className={styles.signerRow}>
                  <div className={styles.signerLabel}>
                    {t("cases.detail.distribution.labels.failed")}
                  </div>
                  <div className={styles.signerValue}>
                    {t("cases.detail.distribution.count", {
                      count: distribution?.failedCount ?? 0
                    })}
                  </div>
                </div>
                <div className={styles.signerRow}>
                  <div className={styles.signerLabel}>
                    {t("cases.detail.distribution.labels.skipped")}
                  </div>
                  <div className={styles.signerValue}>
                    {t("cases.detail.distribution.count", {
                      count: distribution?.skippedCount ?? 0
                    })}
                  </div>
                </div>
                <div className={styles.signerRow}>
                  <div className={styles.signerLabel}>
                    {t("cases.detail.distribution.labels.escalation")}
                  </div>
                  <div className={styles.signerValue}>
                    {t("cases.detail.distribution.count", {
                      count: distribution?.escalationCount ?? 0
                    })}
                  </div>
                </div>
              </div>
              <div className={styles.distributionActions}>
                <Button
                  type="button"
                  onClick={handleExecuteDistribution}
                  disabled={!canExecuteDistribution}
                >
                  {distributionExecuting
                    ? t("cases.detail.distribution.actions.executing")
                    : distribution?.status === "PARTIAL" || distribution?.status === "FAILED"
                      ? t("cases.detail.distribution.actions.resume")
                      : t("cases.detail.distribution.actions.execute")}
                </Button>
                {distribution?.status === "RUNNING" ? (
                  <span className={styles.distributionNote}>
                    {t("cases.detail.distribution.note.refresh")}
                  </span>
                ) : null}
              </div>
              {distributionDisabledText ? (
                <div className={styles.distributionNote}>{distributionDisabledText}</div>
              ) : null}
              {shouldShowNftReceiveSection ? (
                <div className={styles.nftReceiveSection}>
                  <div className={styles.nftReceiveHeader}>
                    <div className={styles.nftReceiveTitle}>
                      {t("cases.detail.nftReceive.title")}
                    </div>
                    <div className={styles.nftReceiveHint}>
                      {t("cases.detail.nftReceive.hint")}
                    </div>
                  </div>
                  {distributionItemsError ? (
                    <FormAlert variant="error">{t(distributionItemsError)}</FormAlert>
                  ) : null}
                  {nftReceiveError ? (
                    <FormAlert variant="error">{t(nftReceiveError)}</FormAlert>
                  ) : null}
                  <div className={styles.nftReceiveSummary}>
                    <span>{nftReceiveSummary}</span>
                    <span>
                      {t("cases.detail.nftReceive.failedCount", {
                        count: nftReceiveStats.failed
                      })}
                    </span>
                  </div>
                  <div className={styles.nftReceiveList}>
                    {distributionItemsLoading ? (
                      <div className={styles.nftReceiveNote}>{t("common.loading")}</div>
                    ) : (
                      nftReceiveItems.map((item) => {
                        const status = nftReceiveResults[item.itemId]?.status ?? "PENDING";
                        const statusLabel = nftReceiveStatusLabels[status] ?? status;
                        const itemError = resolveMessage(nftReceiveResults[item.itemId]?.error);
                        return (
                          <div key={item.itemId} className={styles.nftReceiveItem}>
                            <div className={styles.nftReceiveItemRow}>
                              <span className={styles.nftReceiveItemLabel}>
                                {t("cases.detail.nftReceive.labels.tokenId")}
                              </span>
                              <span className={styles.nftReceiveItemValue}>
                                {item.tokenId ?? "-"}
                              </span>
                            </div>
                            <div className={styles.nftReceiveItemRow}>
                              <span className={styles.nftReceiveItemLabel}>
                                {t("cases.detail.nftReceive.labels.status")}
                              </span>
                              <span className={styles.nftReceiveItemValue}>
                                {statusLabel}
                              </span>
                            </div>
                            {itemError ? (
                              <div className={styles.nftReceiveItemError}>{itemError}</div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className={styles.nftReceiveActions}>
                    <FormField label={t("cases.detail.nftReceive.seed.label")}>
                      <Input
                        value={nftReceiveSeed}
                        onChange={(event) => setNftReceiveSeed(event.target.value)}
                        placeholder="s..."
                        type="password"
                        disabled={nftReceiveExecuting}
                      />
                    </FormField>
                    <div className={styles.nftReceiveActionRow}>
                      <Button
                        type="button"
                        onClick={handleAcceptNftOffers}
                        disabled={nftReceiveExecuting || distributionItemsLoading}
                      >
                        {nftReceiveExecuting
                          ? t("cases.detail.nftReceive.actions.executing")
                          : t("cases.detail.nftReceive.actions.execute")}
                      </Button>
                      <div className={styles.nftReceiveNote}>
                        {t("cases.detail.nftReceive.seed.note")}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>{t("cases.detail.deathClaims.title")}</h2>
            </div>
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>
                {t("cases.detail.deathClaims.unavailable.title")}
              </div>
              <div className={styles.emptyBody}>
                {t("cases.detail.deathClaims.unavailable.body")}
              </div>
            </div>
          </div>
        )
      ) : null}

      {tab === "heirs" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{t("cases.detail.heirs.title")}</h2>
            {isOwner && !isLocked ? (
              <Button type="button" size="sm" onClick={handleOpenInviteModal}>
                {t("cases.detail.heirs.actions.add")}
              </Button>
            ) : null}
          </div>
          {isOwner && !isLocked ? (
            <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("cases.detail.heirs.dialog.addTitle")}</DialogTitle>
                  <DialogDescription>
                    {t("cases.detail.heirs.dialog.addDescription")}
                  </DialogDescription>
                </DialogHeader>
                <form className={styles.form} onSubmit={handleInviteSubmit}>
                  <FormField label={t("cases.detail.heirs.form.email")}>
                    <Input
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="example@example.com"
                      type="email"
                    />
                  </FormField>
                  <FormField label={t("cases.detail.heirs.form.relation")}>
                    <select
                      className={styles.select}
                      value={inviteRelation}
                      onChange={(event) => setInviteRelation(event.target.value as RelationOption)}
                    >
                      {relationOptions.map((option) => (
                        <option key={option} value={option}>
                          {renderRelationLabel(option)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  {inviteRelation === relationOtherValue ? (
                    <FormField label={t("cases.detail.heirs.form.relationOther")}>
                      <Input
                        value={inviteRelationOther}
                        onChange={(event) => setInviteRelationOther(event.target.value)}
                        placeholder={t("cases.detail.heirs.form.relationOtherPlaceholder")}
                      />
                    </FormField>
                  ) : null}
                  <FormField label={t("cases.detail.heirs.form.memo")}>
                    <Textarea
                      value={inviteMemo}
                      onChange={(event) => setInviteMemo(event.target.value)}
                      placeholder={t("cases.detail.heirs.form.memoPlaceholder")}
                    />
                  </FormField>
                  <div className={styles.formActions}>
                    <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                      {inviting
                        ? t("cases.detail.heirs.form.submitting")
                        : t("cases.detail.heirs.form.submit")}
                    </Button>
                  </div>
                </form>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="ghost">
                      {t("common.close")}
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : isOwner && isLocked ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>
                {t("cases.detail.heirs.locked.title")}
              </div>
              <div className={styles.emptyBody}>
                {t("cases.detail.heirs.locked.body")}
              </div>
            </div>
          ) : null}
          {loading ? null : isOwner ? (
            ownerInvites.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyTitle}>
                  {t("cases.detail.heirs.invites.empty.title")}
                </div>
                <div className={styles.emptyBody}>
                  {t("cases.detail.heirs.invites.empty.body")}
                </div>
              </div>
            ) : (
              <div className={styles.list}>
                {ownerInvites.map((invite) => (
                  <div key={invite.inviteId} className={styles.row}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>{invite.email}</div>
                      <div className={styles.rowMetaStack}>
                        <div className={styles.rowMeta}>
                          {t("cases.detail.heirs.relationLabel")}:{" "}
                          {renderRelationLabel(invite.relationLabel, invite.relationOther)}
                        </div>
                        <div className={styles.rowMeta}>
                          {t("cases.detail.heirs.memoLabel")}:{" "}
                          {invite.memo?.trim() ? invite.memo : t("common.unset")}
                        </div>
                      </div>
                    </div>
                    <div className={styles.rowSideActions}>
                      <span className={styles.statusBadge}>
                        {invite.status === "pending"
                          ? t("cases.detail.heirs.invites.status.pending")
                          : invite.status === "accepted"
                            ? t("cases.detail.heirs.invites.status.accepted")
                            : t("cases.detail.heirs.invites.status.declined")}
                      </span>
                      {isLocked ? null : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenInviteEdit(invite)}
                        >
                          {t("cases.detail.heirs.actions.edit")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : heirs.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>
                {t("cases.detail.heirs.empty.title")}
              </div>
              <div className={styles.emptyBody}>
                {t("cases.detail.heirs.empty.body")}
              </div>
            </div>
          ) : (
            <div className={styles.list}>
              {heirs.map((heir) => (
                <div key={heir.inviteId} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{heir.email}</div>
                    <div className={styles.rowMeta}>
                      {t("cases.detail.heirs.relationLabel")}:{" "}
                      {renderRelationLabel(heir.relationLabel, heir.relationOther)}
                    </div>
                  </div>
                  <div className={styles.rowSide}>
                    <div className={styles.rowBadgeStack}>
                      <span className={styles.statusBadge}>
                        {t("cases.detail.heirs.status.accepted")}
                      </span>
                      {heir.walletStatus ? (
                        <span className={styles.statusBadge}>
                          {walletStatusLabels[heir.walletStatus] ?? heir.walletStatus}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {isOwner ? (
            <Dialog
              open={Boolean(editingInvite)}
              onOpenChange={(open) => {
                if (open) return;
                setEditingInvite(null);
                setInviteEditRelation(relationOptions[0]);
                setInviteEditRelationOther("");
                setInviteEditMemo("");
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("cases.detail.heirs.dialog.editTitle")}</DialogTitle>
                  <DialogDescription>
                    {t("cases.detail.heirs.dialog.editDescription")}
                  </DialogDescription>
                </DialogHeader>
                <form className={styles.form} onSubmit={handleInviteUpdateSubmit}>
                  <FormField label={t("cases.detail.heirs.form.email")}>
                    <Input value={editingInvite?.email ?? ""} readOnly />
                  </FormField>
                  <FormField label={t("cases.detail.heirs.form.relation")}>
                    <select
                      className={styles.select}
                      value={inviteEditRelation}
                      onChange={(event) =>
                        setInviteEditRelation(event.target.value as RelationOption)
                      }
                    >
                      {relationOptions.map((option) => (
                        <option key={option} value={option}>
                          {renderRelationLabel(option)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  {inviteEditRelation === relationOtherValue ? (
                    <FormField label={t("cases.detail.heirs.form.relationOther")}>
                      <Input
                        value={inviteEditRelationOther}
                        onChange={(event) => setInviteEditRelationOther(event.target.value)}
                        placeholder={t("cases.detail.heirs.form.relationOtherPlaceholder")}
                      />
                    </FormField>
                  ) : null}
                  <FormField label={t("cases.detail.heirs.form.memo")}>
                    <Textarea
                      value={inviteEditMemo}
                      onChange={(event) => setInviteEditMemo(event.target.value)}
                      placeholder={t("cases.detail.heirs.form.memoPlaceholder")}
                    />
                  </FormField>
                  <div className={styles.formActions}>
                    <Button type="submit" disabled={inviteUpdating}>
                      {inviteUpdating
                        ? t("cases.detail.heirs.actions.saving")
                        : t("cases.detail.heirs.actions.save")}
                    </Button>
                  </div>
                </form>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="ghost">
                      {t("common.close")}
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      ) : null}

      {tab === "wallet" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{t("cases.detail.wallet.title")}</h2>
          </div>
          {isOwner === false ? (
            <div className={styles.walletSection}>
              <div className={styles.walletRow}>
                <span className={styles.walletLabel}>
                  {t("cases.detail.wallet.statusLabel")}
                </span>
                <span className={styles.walletStatus}>
                  {isHeirWalletVerified
                    ? t("cases.detail.wallet.status.verified")
                    : hasHeirWallet
                      ? t("cases.detail.wallet.status.pending")
                      : t("cases.detail.wallet.status.unregistered")}
                </span>
              </div>
              {heirWalletError ? (
                <FormAlert variant="error">{t(heirWalletError)}</FormAlert>
              ) : null}
              {heirWalletLoading ? (
                <div className={styles.badgeMuted}>{t("cases.detail.wallet.loading")}</div>
              ) : null}
              {hasHeirWallet ? (
                <div className={styles.walletAddress}>
                  <div className={styles.walletAddressLabel}>
                    {t("cases.detail.wallet.addressLabel")}
                  </div>
                  <div className={styles.walletAddressValue}>{heirWallet?.address}</div>
                </div>
              ) : null}
              <div className={styles.walletActions}>
                {isHeirWalletVerified ? null : (
                  <Button type="button" onClick={() => handleOpenWalletDialog("register")}>
                    {t("cases.detail.wallet.actions.register")}
                  </Button>
                )}
                {isHeirWalletVerified ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenWalletDialog("verify")}
                    disabled={!hasHeirWallet}
                  >
                    {t("cases.detail.wallet.actions.verify")}
                  </Button>
                )}
              </div>
              <Dialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {walletDialogMode === "verify"
                        ? t("cases.detail.wallet.dialog.verifyTitle")
                        : t("cases.detail.wallet.dialog.registerTitle")}
                    </DialogTitle>
                    <DialogDescription>
                      {t("cases.detail.wallet.dialog.description")}
                    </DialogDescription>
                  </DialogHeader>
                  {heirWalletError ? (
                    <FormAlert variant="error">{t(heirWalletError)}</FormAlert>
                  ) : null}
                  {heirWalletVerifyError ? (
                    <FormAlert variant="error">{t(heirWalletVerifyError)}</FormAlert>
                  ) : null}
                  {heirWalletVerifySuccess ? (
                    <FormAlert variant="success">{t(heirWalletVerifySuccess)}</FormAlert>
                  ) : null}
                  {copyMessage ? <FormAlert variant="info">{copyMessage}</FormAlert> : null}
                  <div className={styles.walletForm}>
                    <FormField label={t("cases.detail.wallet.form.addressLabel")}>
                      <Input
                        value={heirWalletAddressInput}
                        onChange={(event) => setHeirWalletAddressInput(event.target.value)}
                        placeholder="r..."
                      />
                    </FormField>
                    <div className={styles.walletActions}>
                      <Button
                        type="button"
                        onClick={handleSaveHeirWallet}
                        disabled={heirWalletSaving}
                      >
                        {heirWalletSaving
                          ? t("cases.detail.wallet.form.saving")
                          : t("cases.detail.wallet.form.save")}
                      </Button>
                      {hasHeirWallet ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleRequestHeirWalletChallenge}
                          disabled={heirWalletVerifyLoading}
                        >
                          {t("cases.detail.wallet.form.startVerify")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {hasHeirWallet ? (
                    <div className={styles.walletVerifyBox}>
                      <WalletVerifyPanel
                        destination={heirWalletDestinationDisplay}
                        memo={heirWalletMemoDisplay}
                        secret={heirWalletSecret}
                        onSecretChange={setHeirWalletSecret}
                        onSubmit={handleAutoVerifyHeirWallet}
                        isSubmitting={heirWalletSending}
                        submitDisabled={heirWalletSending || heirWalletVerifyLoading}
                        secretDisabled={heirWalletSending}
                      />
                    </div>
                  ) : (
                    walletDialogMode === "verify" && (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyTitle}>
                          {t("cases.detail.wallet.dialog.empty.title")}
                        </div>
                        <div className={styles.emptyBody}>
                          {t("cases.detail.wallet.dialog.empty.body")}
                        </div>
                      </div>
                    )
                  )}
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="ghost">
                        {t("common.close")}
                      </Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>
                {t("cases.detail.wallet.unavailable.title")}
              </div>
              <div className={styles.emptyBody}>
                {t("cases.detail.wallet.unavailable.body")}
              </div>
            </div>
          )}
        </div>
      ) : null}

    </section>
  );
}
