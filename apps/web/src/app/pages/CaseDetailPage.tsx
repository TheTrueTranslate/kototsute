import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Copy } from "lucide-react";
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
import { getTaskProgress, updateMyTaskProgress } from "../api/tasks";
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
  type DistributionState
} from "../api/distribution";
import {
  confirmHeirWalletVerify,
  getHeirWallet,
  requestHeirWalletVerifyChallenge,
  saveHeirWallet,
  type HeirWallet
} from "../api/heir-wallets";
import {
  createInvite,
  listCaseHeirs,
  listInvitesByOwner,
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
import {
  dropsToXrpInput,
  normalizeNumberInput,
  xrpToDropsInput
} from "../../features/shared/lib/xrp-amount";
import { shouldAutoRequestChallenge } from "../../features/shared/lib/auto-challenge";
import { shouldCloseWalletDialogOnVerify } from "../../features/shared/lib/wallet-dialog";
import styles from "../../styles/caseDetailPage.module.css";
import { DeathClaimsPanel } from "./DeathClaimsPage";
import { relationOptions } from "@kototsute/shared";
import { todoMaster, type TaskItem } from "@kototsute/tasks";

const statusLabels: Record<string, string> = {
  DRAFT: "下書き",
  WAITING: "相続待ち",
  IN_PROGRESS: "相続中",
  COMPLETED: "相続完了"
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

const planStatusLabels: Record<string, string> = {
  DRAFT: "作成中",
  SHARED: "有効",
  INACTIVE: "無効"
};

const walletStatusLabels: Record<string, string> = {
  UNREGISTERED: "未登録",
  PENDING: "未確認",
  VERIFIED: "確認済み"
};

const signerStatusLabels: Record<string, string> = {
  NOT_READY: "準備中",
  SET: "署名受付中",
  FAILED: "準備失敗"
};

const approvalStatusLabels: Record<string, string> = {
  PREPARED: "準備済み",
  SUBMITTED: "送信済み",
  FAILED: "失敗"
};

const approvalNetworkStatusLabels: Record<string, string> = {
  PENDING: "検証待ち",
  VALIDATED: "検証済み（成功）",
  FAILED: "検証済み（失敗）",
  NOT_FOUND: "未反映",
  EXPIRED: "期限切れ"
};

const distributionStatusLabels: Record<string, string> = {
  PENDING: "未実行",
  RUNNING: "実行中",
  PARTIAL: "一部失敗",
  COMPLETED: "完了",
  FAILED: "失敗"
};

export const formatDistributionProgressText = (
  distribution: DistributionState | null
) => {
  if (!distribution?.totalCount) return "-";
  return `成功 ${distribution.successCount} / ${distribution.totalCount} 件`;
};

export const canUpdateTaskProgress = (input: { isLocked: boolean }) => {
  void input;
  return true;
};

export const resolveDistributionDisabledReason = (input: {
  caseData: CaseSummary | null;
  approvalCompleted: boolean;
  totalHeirCount: number;
  unverifiedHeirCount: number;
  distribution: DistributionState | null;
  distributionLoading: boolean;
}) => {
  if (!input.caseData) return "ケース情報が取得できません。";
  if (input.caseData.stage !== "IN_PROGRESS") {
    return "相続中になると分配を実行できます。";
  }
  if (!input.approvalCompleted) {
    return "相続実行の同意が完了すると分配を実行できます。";
  }
  if (input.totalHeirCount === 0) {
    return "相続人が登録されていないため実行できません。";
  }
  if (input.unverifiedHeirCount > 0) {
    return `相続人の受取用ウォレットが全員分確認済みになると実行できます。未確認: ${input.unverifiedHeirCount}人`;
  }
  if (input.distributionLoading) {
    return "分配状況を取得中です。";
  }
  if (input.distribution?.status === "COMPLETED") {
    return "分配は完了しています。";
  }
  if (input.distribution?.status === "RUNNING") {
    return "分配処理が進行中です。";
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
      title: "運営承認済み",
      description: "相続人の同意が必要です。死亡診断書の同意を進めてください。"
    };
  }
  if (input.caseStage === "IN_PROGRESS" && input.signerCompleted) {
    return {
      stepIndex: 3,
      title: "同意完了（相続実行待ち）",
      description: "同意がそろいました。相続実行を待っています。"
    };
  }
  if (input.caseStage === "IN_PROGRESS" && input.signerStatus !== "SET") {
    return {
      stepIndex: 1,
      title: "相続人同意の準備中",
      description: "同意の準備を始めてください。"
    };
  }
  if (input.caseStage === "IN_PROGRESS" && input.approvalStatus === "PREPARED") {
    return {
      stepIndex: 2,
      title: "相続人同意 受付中",
      description: "内容を確認して署名してください。"
    };
  }
  return null;
};

export const resolvePrepareDisabledReason = (input: {
  caseData: CaseSummary | null;
  signerStatusKey: string;
  totalHeirCount: number;
  unverifiedHeirCount: number;
  approvalTx: ApprovalTxSummary | null;
}) => {
  if (!input.caseData) return "ケース情報が取得できません。";
  if (input.caseData.stage !== "IN_PROGRESS") {
    return "相続中になると準備できます。";
  }
  if (input.signerStatusKey === "FAILED") {
    return "同意の準備に失敗しました。運営へご連絡ください。";
  }
  const approvalPrepared =
    input.approvalTx?.status === "PREPARED" ||
    input.approvalTx?.status === "SUBMITTED" ||
    Boolean(input.approvalTx?.txJson);
  if (input.signerStatusKey === "SET" && approvalPrepared) {
    return "同意の準備は完了しています。";
  }
  if (input.totalHeirCount === 0) {
    return "相続人が登録されていないため準備できません。";
  }
  if (input.unverifiedHeirCount > 0) {
    return `相続人の受取用ウォレットが全員分確認済みになると準備できます。未確認: ${input.unverifiedHeirCount}人`;
  }
  return null;
};

export const resolveApprovalTxErrorMessage = (error: any) => {
  const code = error?.data?.code;
  if (code === "NOT_FOUND") return null;
  return error?.message ?? "署名対象の取得に失敗しました";
};

export const resolveSignerFromLabel = () => "送金元：被相続人の相続用ウォレット";

export const buildSignerEntryDisplayList = (input: {
  entries?: Array<{ account: string; weight: number }> | null;
  systemSignerAddress?: string | null;
  heirWalletAddress?: string | null;
}) => {
  const entries = Array.isArray(input.entries) ? input.entries : [];
  const systemSigner = input.systemSignerAddress?.trim() ?? "";
  const heirWallet = input.heirWalletAddress?.trim() ?? "";
  const items = entries
    .map((entry) => {
      const account = typeof entry.account === "string" ? entry.account : "";
      if (!account) return null;
      const isSystem = Boolean(systemSigner && account === systemSigner);
      const isMine = Boolean(heirWallet && account === heirWallet);
      const label = isSystem
        ? "システム署名者"
        : isMine
          ? "あなたの受取用ウォレット"
          : "相続人の受取用ウォレット";
      return { account, label, isSystem, isMine };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const priority = (item: { isSystem: boolean; isMine: boolean }) =>
    item.isSystem ? 0 : item.isMine ? 1 : 2;
  return items.sort(
    (a, b) => priority(a) - priority(b) || a.account.localeCompare(b.account)
  );
};

const encodeMemoHex = (memo: string) => {
  if (!memo) return "";
  const bytes = new TextEncoder().encode(memo);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
};

const formatTxAmount = (amount: any) => {
  if (typeof amount === "string") {
    return `${amount} drops`;
  }
  if (amount && typeof amount === "object") {
    const value = String(amount.value ?? "");
    const currency = String(amount.currency ?? "");
    const issuer = String(amount.issuer ?? "");
    return [value, currency, issuer].filter(Boolean).join(" ");
  }
  return "-";
};

type RelationOption = (typeof relationOptions)[number];

type AssetRowProps = {
  caseId?: string;
  asset: AssetListItem;
};

export const AssetRow = ({ caseId, asset }: AssetRowProps) => {
  const content = (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowTitle}>{asset.label}</div>
        <div className={styles.rowMeta}>{asset.address}</div>
      </div>
      <div className={styles.rowSide}>{formatDate(asset.createdAt)}</div>
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

type TabKey = "assets" | "plans" | "tasks" | "heirs" | "wallet" | "death-claims";

type CaseDetailPageProps = {
  initialTab?: TabKey;
  initialIsOwner?: boolean | null;
  initialCaseData?: CaseSummary | null;
  initialHeirWallet?: HeirWallet | null;
  initialTaskIds?: string[];
  initialHeirs?: CaseHeir[];
  initialWalletDialogOpen?: boolean;
  initialWalletDialogMode?: "register" | "verify";
  initialDeathClaim?: DeathClaimSummary | null;
};

const baseTabItems: { key: TabKey; label: string }[] = [
  { key: "assets", label: "資産" },
  { key: "plans", label: "指図" },
  { key: "tasks", label: "タスク" },
  { key: "heirs", label: "相続人" }
];

const allTabKeys: TabKey[] = ["assets", "plans", "tasks", "heirs", "wallet", "death-claims"];

const isTabKey = (value: string | null): value is TabKey =>
  Boolean(value && allTabKeys.includes(value as TabKey));

export default function CaseDetailPage({
  initialTab,
  initialIsOwner = null,
  initialCaseData = null,
  initialHeirWallet = null,
  initialTaskIds = [],
  initialHeirs = [],
  initialWalletDialogOpen = false,
  initialWalletDialogMode = "register",
  initialDeathClaim = null
}: CaseDetailPageProps) {
  const { caseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get("tab");
  const { user } = useAuth();
  const [caseData, setCaseData] = useState<CaseSummary | null>(initialCaseData);
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [ownerInvites, setOwnerInvites] = useState<InviteListItem[]>([]);
  const [heirs, setHeirs] = useState<CaseHeir[]>(initialHeirs);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRelation, setInviteRelation] = useState<RelationOption>(relationOptions[0]);
  const [inviteRelationOther, setInviteRelationOther] = useState("");
  const [inviteMemo, setInviteMemo] = useState("");
  const [inviting, setInviting] = useState(false);
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
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [userCompletedTaskIds, setUserCompletedTaskIds] = useState<string[]>(initialTaskIds);
  const [heirWallet, setHeirWallet] = useState<HeirWallet | null>(initialHeirWallet);
  const [heirWalletLoading, setHeirWalletLoading] = useState(false);
  const [heirWalletError, setHeirWalletError] = useState<string | null>(null);
  const [deathClaim, setDeathClaim] = useState<DeathClaimSummary | null>(initialDeathClaim);
  const [heirWalletSaving, setHeirWalletSaving] = useState(false);
  const [heirWalletVerifyLoading, setHeirWalletVerifyLoading] = useState(false);
  const [heirWalletVerifyError, setHeirWalletVerifyError] = useState<string | null>(null);
  const [heirWalletVerifySuccess, setHeirWalletVerifySuccess] = useState<string | null>(null);
  const [heirWalletSendError, setHeirWalletSendError] = useState<string | null>(null);
  const [heirWalletSendSuccess, setHeirWalletSendSuccess] = useState<string | null>(null);
  const [heirWalletSending, setHeirWalletSending] = useState(false);
  const [heirWalletSecret, setHeirWalletSecret] = useState("");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [heirWalletChallenge, setHeirWalletChallenge] = useState<{
    challenge: string;
    address: string;
    amountDrops: string;
  } | null>(null);
  const [heirWalletTxHash, setHeirWalletTxHash] = useState("");
  const [heirWalletAddressInput, setHeirWalletAddressInput] = useState(
    initialHeirWallet?.address ?? ""
  );
  const [dropsInput, setDropsInput] = useState("1");
  const [xrpInput, setXrpInput] = useState("0.000001");
  const [walletDialogOpen, setWalletDialogOpen] = useState(initialWalletDialogOpen);
  const [walletDialogMode, setWalletDialogMode] =
    useState<"register" | "verify">(initialWalletDialogMode);
  const [signerList, setSignerList] = useState<SignerListSummary | null>(null);
  const [signerLoading, setSignerLoading] = useState(false);
  const [signerError, setSignerError] = useState<string | null>(null);
  const [approvalTx, setApprovalTx] = useState<ApprovalTxSummary | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [distribution, setDistribution] = useState<DistributionState | null>(null);
  const [distributionLoading, setDistributionLoading] = useState(false);
  const [distributionError, setDistributionError] = useState<string | null>(null);
  const [distributionExecuting, setDistributionExecuting] = useState(false);
  const [prepareLoading, setPrepareLoading] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [prepareSuccess, setPrepareSuccess] = useState<string | null>(null);
  const [signerSeed, setSignerSeed] = useState("");
  const [signerSignedBlob, setSignerSignedBlob] = useState("");
  const [signerSignedHash, setSignerSignedHash] = useState("");
  const [signerSigning, setSignerSigning] = useState(false);
  const [signerSubmitting, setSignerSubmitting] = useState(false);
  const autoSignKeyRef = useRef("");
  const tabItems = useMemo(() => {
    if (isOwner === false) {
      return [
        baseTabItems[0],
        baseTabItems[1],
        baseTabItems[2],
        { key: "death-claims" as const, label: "相続実行" },
        { key: "wallet" as const, label: "受取用ウォレット" },
        baseTabItems[3]
      ];
    }
    return baseTabItems;
  }, [isOwner]);
  const availableTabKeys = useMemo(() => tabItems.map((item) => item.key), [tabItems]);

  const title = useMemo(
    () => caseData?.ownerDisplayName ?? "ケース詳細",
    [caseData]
  );
  const personalTasks = useMemo(() => {
    if (isOwner === true) return todoMaster.owner;
    if (isOwner === false) return todoMaster.heir;
    return [];
  }, [isOwner]);

  const sortTasks = (tasks: TaskItem[]) =>
    [...tasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const visiblePersonalTasks = useMemo(() => sortTasks(personalTasks), [personalTasks]);
  const isHeir = isOwner === false;
  const isLocked = caseData?.assetLockStatus === "LOCKED";
  const canUpdateTasks = canUpdateTaskProgress({ isLocked });
  const canAccessDeathClaims =
    caseData?.stage === "WAITING" ||
    caseData?.stage === "IN_PROGRESS" ||
    caseData?.stage === "COMPLETED";
  const hasHeirWallet = Boolean(heirWallet?.address);
  const isHeirWalletVerified = heirWallet?.verificationStatus === "VERIFIED";
  const needsHeirWalletRegistration = isHeir && !hasHeirWallet;
  const needsHeirWalletVerification = isHeir && hasHeirWallet && !isHeirWalletVerified;
  const getWalletNotice = (taskId: string) => {
    if (!isHeir) return null;
    if (taskId === "heir.register-wallet" && needsHeirWalletRegistration) {
      return "ウォレット登録が必要です";
    }
    if (taskId === "heir.verify-wallet" && needsHeirWalletVerification) {
      return "所有確認が必要です";
    }
    return null;
  };
  const signerStatusKey = signerList?.status ?? "NOT_READY";
  const signerStatusLabel = signerStatusLabels[signerStatusKey] ?? signerStatusKey;
  const approvalStatusLabel = approvalTx?.status
    ? approvalStatusLabels[approvalTx.status] ?? approvalTx.status
    : "未生成";
  const approvalSubmittedTxHash = approvalTx?.submittedTxHash ?? "";
  const approvalNetworkStatus = approvalTx?.networkStatus ?? null;
  const approvalNetworkStatusLabel = approvalNetworkStatus
    ? approvalNetworkStatusLabels[approvalNetworkStatus] ?? approvalNetworkStatus
    : approvalTx?.status === "SUBMITTED"
      ? "検証待ち"
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
  const approvalAmountDrops =
    typeof approvalTxJson?.Amount === "string" ? approvalTxJson.Amount : "";
  const approvalAmountXrp = approvalAmountDrops
    ? dropsToXrpInput(approvalAmountDrops)
    : "";
  const signerFromLabel = resolveSignerFromLabel();
  const signerToLabel = "送金先：システムのウォレット";
  const approvalSummaryAmount = approvalAmountDrops
    ? `${approvalAmountDrops} drops (${approvalAmountXrp} XRP)`
    : formatTxAmount(approvalTxJson?.Amount);
  const signerTxSummary = approvalTxJson
    ? `送金元: ${signerFromLabel.replace("送金元：", "")} / 送金先: ${signerToLabel.replace(
        "送金先：",
        ""
      )} / 送金額: ${approvalSummaryAmount}`
    : "";
  const signerEntryDisplayList = useMemo(
    () =>
      buildSignerEntryDisplayList({
        entries: signerList?.entries,
        systemSignerAddress: signerList?.systemSignerAddress ?? null,
        heirWalletAddress: heirWallet?.address ?? null
      }),
    [signerList?.entries, signerList?.systemSignerAddress, heirWallet?.address]
  );
  const multiSignNote = signerList?.requiredCount
    ? `相続人の同意が${signerList.requiredCount}人以上とシステム署名が揃うと成立します。`
    : "相続人の過半数の同意とシステム署名が揃うと成立します。";
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
  const nextActionSteps = [
    "運営承認済み",
    "相続人同意の準備中",
    "相続人同意 受付中",
    "同意完了（相続実行待ち）"
  ];
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
    : "未取得";
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
  const canExecuteDistribution =
    !distributionDisabledReason && !distributionExecuting;
  const signerDisabledReason = useMemo(() => {
    if (!caseData) return "ケース情報が取得できません。";
    if (caseData.stage !== "IN_PROGRESS") {
      return "相続中になると署名の送信が可能になります。";
    }
    if (signerStatusKey === "FAILED") {
      return "署名準備に失敗しました。運営へご連絡ください。";
    }
    if (signerStatusKey !== "SET") {
      return "署名準備中です。";
    }
    if (approvalLoading) {
      return "署名対象を取得中です。";
    }
    if (approvalError) {
      return "署名対象の取得に失敗しました。";
    }
    if (!approvalTx?.txJson) {
      return "署名対象が未生成です。";
    }
    if (approvalTx.status === "FAILED") {
      return "署名対象の生成に失敗しました。";
    }
    if (approvalTx.status === "SUBMITTED") {
      if (approvalNetworkStatus === "EXPIRED") {
        return "相続実行の送信が期限切れのため、再準備が必要です。";
      }
      const networkLabel =
        approvalNetworkStatusLabel && approvalNetworkStatusLabel !== "-"
          ? `（${approvalNetworkStatusLabel}）`
          : "";
      return `相続実行は送信済みです${networkLabel}。`;
    }
    if (!hasHeirWallet) {
      return "受取用ウォレットの登録が必要です。";
    }
    if (!isHeirWalletVerified) {
      return "受取用ウォレットの所有確認が必要です。";
    }
    if (signerList?.signedByMe) {
      return "署名済みです。";
    }
    if (signerCompleted) {
      return "必要数の署名が揃っています。";
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
  const canSubmitSignature =
    !signerDisabledReason &&
    !signerSubmitting &&
    !signerSigning &&
    signerSignedBlob.trim().length > 0;

  useEffect(() => {
    let active = true;
    if (!caseId) {
      if (active) {
        setError("ケースIDが取得できません");
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
              setHeirWalletError(err?.message ?? "ウォレットの取得に失敗しました");
            }
          } finally {
            if (active) {
              setHeirWalletLoading(false);
            }
          }
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message ?? "ケースの取得に失敗しました");
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
    if (!caseId) return;
    let active = true;
    const load = async () => {
      setTaskLoading(true);
      setTaskError(null);
      try {
        const progress = await getTaskProgress(caseId);
        if (!active) return;
        setUserCompletedTaskIds(progress.userCompletedTaskIds ?? []);
      } catch (err: any) {
        if (!active) return;
        setTaskError(err?.message ?? "タスクの取得に失敗しました");
      } finally {
        if (active) setTaskLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [caseId]);

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
      setSignerError(err?.message ?? "署名状況の取得に失敗しました");
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
      setDistributionError(err?.message ?? "分配状況の取得に失敗しました");
    } finally {
      setDistributionLoading(false);
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
      setPrepareSuccess(
        "同意の準備が完了しました。シークレットを入力して署名を進めてください。"
      );
      setSignerSignedBlob("");
      setSignerSignedHash("");
      autoSignKeyRef.current = "";
      await fetchSignerList();
      await fetchApprovalTx();
    } catch (err: any) {
      const code = err?.data?.code;
      if (code === "HEIR_WALLET_UNVERIFIED" || code === "WALLET_NOT_VERIFIED") {
        setPrepareError("相続人の受取用ウォレットが全員分確認済みになると準備できます。");
      } else if (code === "HEIR_MISSING") {
        setPrepareError("相続人が登録されていないため準備できません。");
      } else if (code === "NOT_READY") {
        setPrepareError("相続中になると準備できます。");
      } else {
        setPrepareError(err?.message ?? "同意の準備に失敗しました");
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
      setPrepareSuccess(
        "同意の再準備が完了しました。シークレットを入力して署名を進めてください。"
      );
      setSignerSignedBlob("");
      setSignerSignedHash("");
      autoSignKeyRef.current = "";
      await fetchSignerList();
      await fetchApprovalTx();
    } catch (err: any) {
      const code = err?.data?.code;
      if (code === "HEIR_WALLET_UNVERIFIED" || code === "WALLET_NOT_VERIFIED") {
        setPrepareError("相続人の受取用ウォレットが全員分確認済みになると準備できます。");
      } else if (code === "HEIR_MISSING") {
        setPrepareError("相続人が登録されていないため準備できません。");
      } else if (code === "NOT_READY") {
        setPrepareError("送信中のため再準備できません。");
      } else {
        setPrepareError(err?.message ?? "同意の再準備に失敗しました");
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
      setDistributionError(err?.message ?? "分配の実行に失敗しました");
    } finally {
      setDistributionExecuting(false);
    }
  };

  const handleSaveHeirWallet = async () => {
    if (!caseId) return;
    const address = heirWalletAddressInput.trim();
    if (!address) {
      setHeirWalletError("ウォレットアドレスを入力してください");
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
      setHeirWalletTxHash("");
    } catch (err: any) {
      setHeirWalletError(err?.message ?? "ウォレットの登録に失敗しました");
    } finally {
      setHeirWalletSaving(false);
    }
  };

  const handleRequestHeirWalletChallenge = async () => {
    if (!caseId) return;
    setHeirWalletVerifyError(null);
    setHeirWalletVerifySuccess(null);
    setHeirWalletSendError(null);
    setHeirWalletSendSuccess(null);
    setHeirWalletSecret("");
    setHeirWalletVerifyLoading(true);
    try {
      const result = await requestHeirWalletVerifyChallenge(caseId);
      setHeirWalletChallenge(result);
      const dropsValue = result.amountDrops ?? "1";
      setDropsInput(dropsValue);
      setXrpInput(dropsToXrpInput(dropsValue));
    } catch (err: any) {
      setHeirWalletVerifyError(err?.message ?? "検証コードの取得に失敗しました");
    } finally {
      setHeirWalletVerifyLoading(false);
    }
  };

  const handleDropsChange = (value: string) => {
    const cleaned = normalizeNumberInput(value);
    setDropsInput(cleaned);
    setXrpInput(dropsToXrpInput(cleaned));
  };

  const handleXrpChange = (value: string) => {
    const cleaned = normalizeNumberInput(value);
    setXrpInput(cleaned);
    setDropsInput(xrpToDropsInput(cleaned));
  };

  const handleCopy = async (label: string, value: string) => {
    const result = await copyText(label, value);
    setCopyMessage(result.message);
    if (result.ok) {
      window.setTimeout(() => setCopyMessage(null), 1500);
    }
  };

  const handleConfirmHeirWalletVerify = async () => {
    if (!caseId) return;
    const txHash = heirWalletTxHash.trim();
    if (!txHash) {
      setHeirWalletVerifyError("取引ハッシュを入力してください");
      return;
    }
    setHeirWalletVerifyLoading(true);
    setHeirWalletVerifyError(null);
    setHeirWalletVerifySuccess(null);
    try {
      await confirmHeirWalletVerify(caseId, txHash);
      const wallet = await getHeirWallet(caseId);
      setHeirWallet(wallet);
      setHeirWalletVerifySuccess("所有確認が完了しました");
      setHeirWalletChallenge(null);
      setHeirWalletTxHash("");
      if (shouldCloseWalletDialogOnVerify(wallet?.verificationStatus === "VERIFIED")) {
        setWalletDialogOpen(false);
      }
    } catch (err: any) {
      setHeirWalletVerifyError(err?.message ?? "所有確認に失敗しました");
    } finally {
      setHeirWalletVerifyLoading(false);
    }
  };

  const handleSendHeirWalletVerification = async () => {
    if (!caseId) return;
    if (!heirWalletChallenge) {
      setHeirWalletSendError("検証コードを発行してください");
      return;
    }
    if (!heirWallet?.address) {
      setHeirWalletSendError("ウォレットアドレスが取得できません");
      return;
    }
    const secret = heirWalletSecret.trim();
    if (!secret) {
      setHeirWalletSendError("シークレットを入力してください");
      return;
    }
    setHeirWalletSendError(null);
    setHeirWalletSendSuccess(null);
    setHeirWalletSending(true);
    try {
      const memoHex = encodeMemoHex(heirWalletChallenge.challenge ?? "");
      const tx = await createPaymentTx({
        from: heirWallet.address,
        to: heirWalletChallenge.address,
        amount: heirWalletChallenge.amountDrops ?? "1",
        memoHex
      });
      const signed = signSingle(tx, secret);
      const result = await submitSignedBlob(signed.blob);
      setHeirWalletTxHash(result.txHash);
      setHeirWalletSendSuccess("送金を実行しました。取引ハッシュを入力しました。");
      setHeirWalletSecret("");
    } catch (err: any) {
      setHeirWalletSendError(err?.message ?? "送金に失敗しました");
    } finally {
      setHeirWalletSending(false);
    }
  };

  const signApprovalTx = useCallback(
    (secret: string) => {
      if (!approvalTx?.txJson) {
        setSignerError("署名対象トランザクションが取得できません");
        return false;
      }
      setSignerSigning(true);
      setSignerError(null);
      try {
        const result = signForMultisign(approvalTx.txJson, secret);
        setSignerSignedBlob(result.blob);
        setSignerSignedHash(result.hash);
        return true;
      } catch (err: any) {
        setSignerSignedBlob("");
        setSignerSignedHash("");
        setSignerError(err?.message ?? "署名の生成に失敗しました");
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
      setSignerSignedHash("");
      return;
    }
    if (signerSigning || signerSubmitting) {
      return;
    }
    const secret = signerSeed.trim();
    if (!secret) {
      autoSignKeyRef.current = "";
      setSignerSignedBlob("");
      setSignerSignedHash("");
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
      setSignerError("署名済みデータを入力してください");
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
      setSignerSignedHash("");
      setSignerSeed("");
      void fetchApprovalTx();
    } catch (err: any) {
      setSignerError(err?.message ?? "署名の送信に失敗しました");
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

  const handleInviteSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLocked) return;
    if (!caseId) {
      setError("ケースIDが取得できません");
      return;
    }
    setError(null);
    setInviting(true);
    try {
      await createInvite(caseId, {
        email: inviteEmail,
        relationLabel: inviteRelation,
        relationOther: inviteRelation === "その他" ? inviteRelationOther : undefined,
        memo: inviteMemo.trim() ? inviteMemo : undefined
      });
      setInviteEmail("");
      setInviteRelation(relationOptions[0]);
      setInviteRelationOther("");
      setInviteMemo("");
      const inviteItems = await listInvitesByOwner(caseId);
      setOwnerInvites(inviteItems);
    } catch (err: any) {
      setError(err?.message ?? "招待の送信に失敗しました");
    } finally {
      setInviting(false);
    }
  };

  const buildNextTaskIds = (current: string[], taskId: string, checked: boolean) => {
    if (checked) {
      return Array.from(new Set([...current, taskId]));
    }
    return current.filter((id) => id !== taskId);
  };

  const handleTogglePersonalTask = async (taskId: string, checked: boolean) => {
    if (!canUpdateTasks) return;
    if (!caseId) return;
    const prev = userCompletedTaskIds;
    const next = buildNextTaskIds(prev, taskId, checked);
    setUserCompletedTaskIds(next);
    try {
      await updateMyTaskProgress(caseId, next);
    } catch (err: any) {
      setUserCompletedTaskIds(prev);
      setTaskError(err?.message ?? "タスクの更新に失敗しました");
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: "ケース", href: "/cases" },
            { label: title }
          ]}
        />
        <div className={styles.headerRow}>
          <div className={styles.headerMain}>
            <h1 className="text-title">{title}</h1>
            {caseData ? (
              <div className={styles.headerMeta}>
                <span className={styles.statusBadge}>
                  {statusLabels[caseData.stage] ?? caseData.stage}
                </span>
                <span className={styles.metaText}>更新: {formatDate(caseData.updatedAt)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <Tabs items={tabItems} value={tab} onChange={handleTabChange} />

      {tab === "assets" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>資産</h2>
            {caseId && isOwner && !isLocked ? (
              <div className={styles.panelActions}>
                <Button asChild size="sm" variant="secondary">
                  <Link to={`/cases/${caseId}/asset-lock`}>資産をロックする</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to={`/cases/${caseId}/assets/new`}>資産を追加</Link>
                </Button>
              </div>
            ) : null}
          </div>
          {loading ? null : isOwner === false ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>資産は被相続人のみ閲覧できます</div>
              <div className={styles.emptyBody}>
                相続人として参加しているケースでは資産は表示されません。
              </div>
            </div>
          ) : assets.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>まだ資産が登録されていません</div>
              <div className={styles.emptyBody}>「資産を追加」から登録できます。</div>
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
            <h2 className={styles.panelTitle}>指図</h2>
            {caseId && isOwner && !isLocked ? (
              <Button asChild size="sm">
                <Link to={`/cases/${caseId}/plans/new`}>指図を作成</Link>
              </Button>
            ) : null}
          </div>
          {loading ? null : plans.length === 0 ? (
            <div className={styles.emptyState}>
              {isOwner === false ? (
                <>
                  <div className={styles.emptyTitle}>指図がありません</div>
                  <div className={styles.emptyBody}>
                    指図が作成されるとここに表示されます。
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.emptyTitle}>まだ指図がありません</div>
                  <div className={styles.emptyBody}>最初の指図を作成できます。</div>
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
                      <div className={styles.rowMeta}>更新: {formatDate(plan.updatedAt)}</div>
                    </div>
                    <div className={styles.rowSide}>
                      <span className={styles.statusBadge}>
                        {planStatusLabels[plan.status] ?? plan.status}
                      </span>
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
              <h2 className={styles.panelTitle}>相続実行</h2>
            </div>
            <div className={styles.muted}>読み込み中...</div>
          </div>
        ) : !caseData ? (
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>相続実行</h2>
            </div>
            <div className={styles.muted}>ケース情報が取得できません。</div>
          </div>
        ) : canAccessDeathClaims ? (
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>相続実行</h2>
            </div>
            {nextAction ? (
              <div className={styles.nextAction}>
                <div className={styles.nextActionTitle}>次のアクション</div>
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
                <div className={styles.nextActionBody}>{nextAction.description}</div>
              </div>
            ) : null}
            <details className={styles.collapsible}>
              <summary className={styles.collapsibleSummary}>
                <div className={styles.collapsibleText}>
                  <div className={styles.collapsibleTitle}>死亡診断書</div>
                  <div className={styles.collapsibleHint}>提出状況の確認・再提出</div>
                </div>
                <span className={styles.collapsibleChevron} aria-hidden="true" />
              </summary>
              <div className={styles.collapsibleBody}>
                <DeathClaimsPanel
                  initialClaim={initialDeathClaim ?? null}
                  onClaimChange={setDeathClaim}
                />
              </div>
            </details>
            <details className={styles.collapsible} open>
              <summary className={styles.collapsibleSummary}>
                <div className={styles.collapsibleText}>
                  <div className={styles.collapsibleTitle}>相続実行の同意</div>
                  <div className={styles.collapsibleHint}>
                    システム+相続人の過半数の署名が揃うと相続実行が進みます。
                  </div>
                </div>
                <span className={styles.collapsibleMeta}>
                  <span className={styles.signerBadge}>{signerStatusLabel}</span>
                  <span className={styles.collapsibleChevron} aria-hidden="true" />
                </span>
              </summary>
              <div className={styles.collapsibleBody}>
                <div className={styles.signerSection}>
              <div className={styles.signerPrepare}>
                <div className={styles.signerPrepareTitle}>同意の準備</div>
                <div className={styles.signerPrepareHint}>
                  相続人の同意を進めるために、署名対象を作成します。
                </div>
                <div className={styles.signerPrepareActions}>
                  <Button
                    type="button"
                    onClick={handlePrepareApproval}
                    disabled={!canPrepareApproval || prepareLoading}
                  >
                    {prepareLoading ? "準備中..." : "相続同意の準備を始める"}
                  </Button>
                </div>
                {prepareDisabledReason ? (
                  <div className={styles.signerPrepareNote}>{prepareDisabledReason}</div>
                ) : null}
              </div>
              {signerError ? <FormAlert variant="error">{signerError}</FormAlert> : null}
              {approvalError ? <FormAlert variant="error">{approvalError}</FormAlert> : null}
              {prepareError ? <FormAlert variant="error">{prepareError}</FormAlert> : null}
              {prepareSuccess ? <FormAlert variant="success">{prepareSuccess}</FormAlert> : null}
              {signerList?.error ? (
                <FormAlert variant="error">{signerList.error}</FormAlert>
              ) : null}
              {copyMessage ? <FormAlert variant="info">{copyMessage}</FormAlert> : null}
              <div className={styles.signerGrid}>
                <div className={styles.signerRow}>
                  <div className={styles.signerLabel}>署名状況</div>
                  <div className={styles.signerValue}>
                    {signerLoading
                      ? "読み込み中..."
                      : signerList
                        ? `${signerList.signaturesCount} / ${signerList.requiredCount} 人`
                        : "-"}
                  </div>
                </div>
                <div className={styles.signerRow}>
                  <div className={styles.signerLabel}>あなたの署名</div>
                  <div className={styles.signerValue}>
                    {signerList?.signedByMe ? "署名済み" : "未署名"}
                  </div>
                </div>
                {approvalCompleted ? (
                  <div className={styles.signerRow}>
                    <div className={styles.signerLabel}>相続状態</div>
                    <div className={styles.signerValue}>相続完了</div>
                  </div>
                ) : null}
              </div>
              <div className={styles.signerMultiSign}>
                <div className={styles.signerMultiSignTitle}>
                  MultiSignのしくみ（アドレス）
                </div>
                <div className={styles.signerMultiSignBody}>
                  <div className={styles.signerMultiSignRow}>
                    <div className={styles.signerMultiSignLabel}>送金元</div>
                    <div className={styles.signerMultiSignValue}>
                      {approvalTxJson?.Account ?? "-"}
                    </div>
                  </div>
                  <div className={styles.signerMultiSignRow}>
                    <div className={styles.signerMultiSignLabel}>署名者</div>
                    {signerEntryDisplayList.length ? (
                      <ul className={styles.signerMultiSignList}>
                        {signerEntryDisplayList.map((entry) => (
                          <li
                            key={`${entry.account}-${entry.label}`}
                            className={styles.signerMultiSignItem}
                          >
                            <div className={styles.signerMultiSignItemLabel}>
                              {entry.label}
                            </div>
                            <div className={styles.signerMultiSignItemValue}>
                              {entry.account}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className={styles.muted}>
                        署名の準備が完了すると表示します。
                      </div>
                    )}
                  </div>
                  <div className={styles.signerMultiSignRow}>
                    <div className={styles.signerMultiSignLabel}>送金先</div>
                    <div className={styles.signerMultiSignValue}>
                      {approvalTxJson?.Destination ?? "-"}
                    </div>
                  </div>
                </div>
                <div className={styles.signerMultiSignNote}>{multiSignNote}</div>
              </div>
              {showSignerDetails ? (
                <div className={styles.signerTxSection}>
                  <div className={styles.signerTxHeader}>
                    <div className={styles.signerTxHeaderMain}>
                      <div className={styles.signerTxTitle}>署名内容</div>
                      <div className={styles.signerTxHint}>
                        送金内容とMemoが正しいことを確認してください。
                      </div>
                    </div>
                    <span className={styles.signerTxBadge}>{approvalStatusLabel}</span>
                  </div>
                  {approvalSubmitted ? (
                    <div className={styles.signerTxStatus}>
                      <div className={styles.signerTxRow}>
                        <div>
                          <div className={styles.signerTxLabel}>送信Tx</div>
                          <div className={styles.signerTxValue}>
                            {approvalSubmittedTxHash || "-"}
                          </div>
                        </div>
                        {approvalSubmittedTxHash ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className={styles.copyButton}
                            onClick={() => handleCopy("送信Tx", approvalSubmittedTxHash)}
                            aria-label="送信Txをコピー"
                          >
                            <Copy />
                          </Button>
                        ) : null}
                      </div>
                      <div className={styles.signerTxRow}>
                        <div>
                          <div className={styles.signerTxLabel}>送信後の状態</div>
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
                            再準備
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void fetchApprovalTx()}
                          disabled={approvalLoading || !canPollApprovalStatus}
                        >
                          再取得
                        </Button>
                      </div>
                      <div className={styles.signerTxNote}>
                        {canReprepareApproval
                          ? "期限切れのため再準備が必要です。"
                          : "1分ごとに自動更新します。"}
                      </div>
                    </div>
                  ) : null}
                  {approvalLoading ? (
                    <div className={styles.muted}>署名対象を読み込み中...</div>
                  ) : null}
                  {approvalTxJson ? (
                    <details className={styles.collapsible}>
                      <summary className={styles.collapsibleSummary}>
                        <div className={styles.collapsibleText}>
                          <div className={styles.collapsibleTitle}>署名内容を確認</div>
                          <div className={styles.collapsibleHint}>{signerTxSummary}</div>
                        </div>
                        <span className={styles.collapsibleChevron} aria-hidden="true" />
                      </summary>
                      <div className={styles.collapsibleBody}>
                        <div className={styles.signerTxGrid}>
                          <div className={styles.signerTxRow}>
                            <div>
                              <div className={styles.signerTxLabel}>{signerFromLabel}</div>
                              <div className={styles.signerTxValue}>
                                {approvalTxJson.Account ?? "-"}
                              </div>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className={styles.copyButton}
                              onClick={() =>
                                handleCopy("送金元", String(approvalTxJson.Account ?? ""))
                              }
                              aria-label="送金元をコピー"
                            >
                              <Copy />
                            </Button>
                          </div>
                          <div className={styles.signerTxRow}>
                            <div>
                              <div className={styles.signerTxLabel}>{signerToLabel}</div>
                              <div className={styles.signerTxValue}>
                                {approvalTxJson.Destination ?? "-"}
                              </div>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className={styles.copyButton}
                              onClick={() =>
                                handleCopy(
                                  "送金先",
                                  String(approvalTxJson.Destination ?? "")
                                )
                              }
                              aria-label="送金先をコピー"
                            >
                              <Copy />
                            </Button>
                          </div>
                          <div className={styles.signerTxRow}>
                            <div>
                              <div className={styles.signerTxLabel}>Memo</div>
                              <div className={styles.signerTxValue}>
                                {approvalTx?.memo ?? "-"}
                              </div>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className={styles.copyButton}
                              onClick={() => handleCopy("Memo", approvalTx?.memo ?? "")}
                              aria-label="Memoをコピー"
                            >
                              <Copy />
                            </Button>
                          </div>
                        </div>
                        <div className={styles.amountGrid}>
                          <div className={styles.amountField}>
                            <FormField label="Amount (drops)">
                              <Input
                                value={approvalAmountDrops}
                                placeholder="-"
                                readOnly
                              />
                            </FormField>
                            <Button
                              size="icon"
                              variant="ghost"
                              className={styles.copyButton}
                              onClick={() => handleCopy("Amount (drops)", approvalAmountDrops)}
                              aria-label="Amount (drops)をコピー"
                            >
                              <Copy />
                            </Button>
                          </div>
                          <div className={styles.amountField}>
                            <FormField label="Amount (XRP)">
                              <Input
                                value={approvalAmountXrp}
                                placeholder="-"
                                readOnly
                              />
                            </FormField>
                            <Button
                              size="icon"
                              variant="ghost"
                              className={styles.copyButton}
                              onClick={() => handleCopy("Amount (XRP)", approvalAmountXrp)}
                              aria-label="Amount (XRP)をコピー"
                            >
                              <Copy />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </details>
                  ) : (
                    <div className={styles.muted}>署名対象が未生成です。</div>
                  )}
                </div>
              ) : (
                <div className={styles.signerTxSection}>
                  <div className={styles.signerTxHeader}>
                    <div className={styles.signerTxHeaderMain}>
                      <div className={styles.signerTxTitle}>送信後の状態</div>
                      <div className={styles.signerTxHint}>
                        ネットワーク反映の状況を確認できます。
                      </div>
                    </div>
                    <span className={styles.signerTxBadge}>{approvalStatusLabel}</span>
                  </div>
                  <div className={styles.signerTxStatus}>
                    <div className={styles.signerTxRow}>
                      <div>
                        <div className={styles.signerTxLabel}>送信Tx</div>
                        <div className={styles.signerTxValue}>
                          {approvalSubmittedTxHash || "-"}
                        </div>
                      </div>
                      {approvalSubmittedTxHash ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className={styles.copyButton}
                          onClick={() => handleCopy("送信Tx", approvalSubmittedTxHash)}
                          aria-label="送信Txをコピー"
                        >
                          <Copy />
                        </Button>
                      ) : null}
                    </div>
                    <div className={styles.signerTxRow}>
                      <div>
                        <div className={styles.signerTxLabel}>送信後の状態</div>
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
                          再準備
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void fetchApprovalTx()}
                        disabled={approvalLoading || !canPollApprovalStatus}
                      >
                        再取得
                      </Button>
                    </div>
                    <div className={styles.signerTxNote}>
                      {canReprepareApproval
                        ? "期限切れのため再準備が必要です。"
                        : "1分ごとに自動更新します。"}
                    </div>
                  </div>
                </div>
              )}
              {showSignerDetails ? (
                <div className={styles.signerGuide}>
                  <div className={styles.signerGuideTitle}>署名の流れ</div>
                  <ol className={styles.signerGuideList}>
                    <li>
                      署名対象は、相続用ウォレット（資産ロック時に作成）から相続人へ分配する
                      XRPLトランザクションです。
                    </li>
                    <li>登録済みの相続人ウォレットでMultiSign署名を行います。</li>
                    <li>
                      シークレットを入力すると署名を自動で作成します（サーバーには送信しません）。
                    </li>
                    <li>署名を送信すると同意が反映されます。</li>
                    <li>必要な署名が揃うと相続実行の送信が自動で行われます。</li>
                  </ol>
                </div>
              ) : null}
              {shouldShowSignerActions(approvalTx?.status ?? null) ? (
                <div className={styles.signerActions}>
                  <div className={styles.signerActionBlock}>
                    <FormField label="シークレット">
                      <Input
                        value={signerSeed}
                        onChange={(event) => setSignerSeed(event.target.value)}
                        placeholder="s..."
                        type="password"
                        disabled={!approvalTxJson || signerDisabledReason !== null}
                      />
                    </FormField>
                    <div className={styles.signerAutoNote}>
                      {signerSigning
                        ? "署名を作成中です..."
                        : signerSignedBlob
                          ? "署名の準備ができました。"
                          : "シークレットを入力すると署名を自動で作成します。"}
                    </div>
                  </div>
                  <div className={styles.signerActionBlock}>
                    <div className={styles.signerActionRow}>
                      <Button
                        type="button"
                        onClick={handleSubmitSignerSignature}
                        disabled={!canSubmitSignature}
                      >
                        {signerSubmitting ? "送信中..." : "署名を送信"}
                      </Button>
                    </div>
                    <div className={styles.signerSecretNote}>
                      シークレットはこの端末内だけで使われます。
                    </div>
                  </div>
                </div>
              ) : null}
              {signerDisabledReason ? (
                <div className={styles.signerNote}>{signerDisabledReason}</div>
              ) : null}
                </div>
              </div>
            </details>
            <div className={styles.distributionSection}>
              <div className={styles.distributionHeader}>
                <div className={styles.distributionHeaderMain}>
                  <div className={styles.distributionTitle}>分配を実行</div>
                  <div className={styles.distributionHint}>
                    相続用ウォレットから受取用ウォレットへ送金します。
                  </div>
                </div>
                <span className={styles.distributionBadge}>{distributionStatusLabel}</span>
              </div>
              {distributionError ? (
                <FormAlert variant="error">{distributionError}</FormAlert>
              ) : null}
              <div className={styles.signerGrid}>
                <div className={styles.signerRow}>
                  <div className={styles.signerLabel}>成功</div>
                  <div className={styles.signerValue}>
                    {formatDistributionProgressText(distribution)}
                  </div>
                </div>
                <div className={styles.signerRow}>
                  <div className={styles.signerLabel}>失敗</div>
                  <div className={styles.signerValue}>
                    {distribution?.failedCount ?? 0} 件
                  </div>
                </div>
                <div className={styles.signerRow}>
                  <div className={styles.signerLabel}>スキップ</div>
                  <div className={styles.signerValue}>
                    {distribution?.skippedCount ?? 0} 件
                  </div>
                </div>
                <div className={styles.signerRow}>
                  <div className={styles.signerLabel}>エスカレ</div>
                  <div className={styles.signerValue}>
                    {distribution?.escalationCount ?? 0} 件
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
                    ? "実行中..."
                    : distribution?.status === "PARTIAL" || distribution?.status === "FAILED"
                      ? "再開"
                      : "分配を実行"}
                </Button>
                {distribution?.status === "RUNNING" ? (
                  <span className={styles.distributionNote}>1分ごとに自動更新します。</span>
                ) : null}
              </div>
              {distributionDisabledReason ? (
                <div className={styles.distributionNote}>{distributionDisabledReason}</div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>相続実行</h2>
            </div>
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>相続待ちになるまで操作できません</div>
              <div className={styles.emptyBody}>
                相続待ちに更新されると相続実行の手続きを進められます。
              </div>
            </div>
          </div>
        )
      ) : null}

      {tab === "heirs" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>相続人</h2>
          </div>
          {isOwner && !isLocked ? (
            <form className={styles.form} onSubmit={handleInviteSubmit}>
              <FormField label="メールアドレス">
                <Input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="example@example.com"
                  type="email"
                />
              </FormField>
              <FormField label="関係">
                <select
                  className={styles.select}
                  value={inviteRelation}
                  onChange={(event) => setInviteRelation(event.target.value as RelationOption)}
                >
                  {relationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormField>
              {inviteRelation === "その他" ? (
                <FormField label="関係（自由入力）">
                  <Input
                    value={inviteRelationOther}
                    onChange={(event) => setInviteRelationOther(event.target.value)}
                    placeholder="例: 同居人"
                  />
                </FormField>
              ) : null}
              <FormField label="メモ（任意）">
                <Textarea
                  value={inviteMemo}
                  onChange={(event) => setInviteMemo(event.target.value)}
                  placeholder="例: 生前からの連絡先"
                />
              </FormField>
              <div className={styles.formActions}>
                <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? "送信中..." : "招待を送る"}
                </Button>
              </div>
            </form>
          ) : isOwner && isLocked ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>資産ロック後は閲覧のみです</div>
              <div className={styles.emptyBody}>相続人の追加や編集はできません。</div>
            </div>
          ) : null}
          {loading ? null : isOwner ? (
            ownerInvites.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyTitle}>まだ招待がありません</div>
                <div className={styles.emptyBody}>相続人に招待を送信できます。</div>
              </div>
            ) : (
              <div className={styles.list}>
                {ownerInvites.map((invite) => (
                  <div key={invite.inviteId} className={styles.row}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>{invite.email}</div>
                      <div className={styles.rowMeta}>
                        関係:{" "}
                        {invite.relationLabel === "その他"
                          ? invite.relationOther ?? "その他"
                          : invite.relationLabel}
                      </div>
                    </div>
                    <div className={styles.rowSide}>
                      <span className={styles.statusBadge}>
                        {invite.status === "pending"
                          ? "招待中"
                          : invite.status === "accepted"
                            ? "参加中"
                            : "辞退"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : heirs.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>相続人が登録されていません</div>
              <div className={styles.emptyBody}>承認済みの相続人がここに表示されます。</div>
            </div>
          ) : (
            <div className={styles.list}>
              {heirs.map((heir) => (
                <div key={heir.inviteId} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{heir.email}</div>
                    <div className={styles.rowMeta}>
                      関係:{" "}
                      {heir.relationLabel === "その他"
                        ? heir.relationOther ?? "その他"
                        : heir.relationLabel}
                    </div>
                  </div>
                  <div className={styles.rowSide}>
                    <div className={styles.rowBadgeStack}>
                      <span className={styles.statusBadge}>承認済み</span>
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
        </div>
      ) : null}

      {tab === "wallet" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>受取用ウォレット</h2>
          </div>
          {isOwner === false ? (
            <div className={styles.walletSection}>
              <div className={styles.walletRow}>
                <span className={styles.walletLabel}>ステータス</span>
                <span className={styles.walletStatus}>
                  {isHeirWalletVerified
                    ? "所有確認済み"
                    : hasHeirWallet
                      ? "未確認"
                      : "未登録"}
                </span>
              </div>
              {heirWalletError ? <FormAlert variant="error">{heirWalletError}</FormAlert> : null}
              {heirWalletLoading ? (
                <div className={styles.badgeMuted}>ウォレット情報を読み込み中...</div>
              ) : null}
              {hasHeirWallet ? (
                <div className={styles.walletAddress}>
                  <div className={styles.walletAddressLabel}>ウォレットアドレス</div>
                  <div className={styles.walletAddressValue}>{heirWallet?.address}</div>
                </div>
              ) : null}
              <div className={styles.walletActions}>
                {isHeirWalletVerified ? null : (
                  <Button type="button" onClick={() => handleOpenWalletDialog("register")}>
                    登録/変更
                  </Button>
                )}
                {isHeirWalletVerified ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenWalletDialog("verify")}
                    disabled={!hasHeirWallet}
                  >
                    所有確認
                  </Button>
                )}
              </div>
              <Dialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {walletDialogMode === "verify"
                        ? "受取用ウォレットの所有確認"
                        : "受取用ウォレットを登録"}
                    </DialogTitle>
                    <DialogDescription>
                      ウォレットアドレスの登録と所有確認を行います。
                    </DialogDescription>
                  </DialogHeader>
                  {heirWalletError ? (
                    <FormAlert variant="error">{heirWalletError}</FormAlert>
                  ) : null}
                  {heirWalletVerifyError ? (
                    <FormAlert variant="error">{heirWalletVerifyError}</FormAlert>
                  ) : null}
                  {heirWalletVerifySuccess ? (
                    <FormAlert variant="success">{heirWalletVerifySuccess}</FormAlert>
                  ) : null}
                  {copyMessage ? <FormAlert variant="info">{copyMessage}</FormAlert> : null}
                  <div className={styles.walletForm}>
                    <FormField label="ウォレットアドレス">
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
                        {heirWalletSaving ? "保存中..." : "登録する"}
                      </Button>
                      {hasHeirWallet ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleRequestHeirWalletChallenge}
                          disabled={heirWalletVerifyLoading}
                        >
                          所有確認を開始
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {hasHeirWallet ? (
                    <div className={styles.walletVerifyBox}>
                      <div className={styles.walletHint}>
                        次の内容で1 dropを送金し、取引ハッシュを入力してください。
                      </div>
                      <div className={styles.verifyBlock}>
                        <div className={styles.verifyRow}>
                          <div>
                            <div className={styles.walletVerifyLabel}>送金先</div>
                            <div className={styles.walletVerifyValue}>
                              {heirWalletChallenge?.address ?? "未発行"}
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={styles.copyButton}
                            onClick={() =>
                              handleCopy(
                                "Destination",
                                heirWalletChallenge?.address ?? ""
                              )
                            }
                            aria-label="Destinationをコピー"
                          >
                            <Copy />
                          </Button>
                        </div>

                        <div className={styles.verifyRow}>
                          <div>
                            <div className={styles.walletVerifyLabel}>Memo</div>
                            <div className={styles.walletVerifyValue}>
                              {heirWalletChallenge?.challenge ?? "未発行"}
                            </div>
                          </div>
                          <div className={styles.verifyRowActions}>
                            <Button
                              size="icon"
                              variant="ghost"
                              className={styles.copyButton}
                              onClick={() =>
                                handleCopy(
                                  "Memo",
                                  heirWalletChallenge?.challenge ?? ""
                                )
                              }
                              aria-label="Memoをコピー"
                            >
                              <Copy />
                            </Button>
                          </div>
                        </div>

                        <div className={styles.amountGrid}>
                          <div className={styles.amountField}>
                            <FormField label="Amount (drops)">
                              <Input
                                value={dropsInput}
                                onChange={(event) => handleDropsChange(event.target.value)}
                                placeholder="例: 1"
                              />
                            </FormField>
                            <Button
                              size="icon"
                              variant="ghost"
                              className={styles.copyButton}
                              onClick={() => handleCopy("Amount (drops)", dropsInput)}
                              aria-label="Amount (drops)をコピー"
                            >
                              <Copy />
                            </Button>
                          </div>
                          <div className={styles.amountField}>
                            <FormField label="Amount (XRP)">
                              <Input
                                value={xrpInput}
                                onChange={(event) => handleXrpChange(event.target.value)}
                                placeholder="例: 0.000001"
                              />
                            </FormField>
                            <Button
                              size="icon"
                              variant="ghost"
                              className={styles.copyButton}
                              onClick={() => handleCopy("Amount (XRP)", xrpInput)}
                              aria-label="Amount (XRP)をコピー"
                            >
                              <Copy />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className={styles.walletVerifyApp}>
                        <div className={styles.walletHint}>
                          アプリ内で送金する場合はシークレットを入力してください。
                        </div>
                        {heirWalletSendError ? (
                          <FormAlert variant="error">{heirWalletSendError}</FormAlert>
                        ) : null}
                        {heirWalletSendSuccess ? (
                          <FormAlert variant="success">{heirWalletSendSuccess}</FormAlert>
                        ) : null}
                        <FormField label="シークレット">
                          <Input
                            value={heirWalletSecret}
                            onChange={(event) => setHeirWalletSecret(event.target.value)}
                            placeholder="s..."
                            type="password"
                            disabled={!heirWalletChallenge}
                          />
                        </FormField>
                        <div className={styles.walletActions}>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleSendHeirWalletVerification}
                            disabled={heirWalletSending || !heirWalletChallenge}
                          >
                            {heirWalletSending ? "送金中..." : "送金してTXハッシュ入力"}
                          </Button>
                        </div>
                      </div>
                      <FormField label="取引ハッシュ">
                        <Input
                          value={heirWalletTxHash}
                          onChange={(event) => setHeirWalletTxHash(event.target.value)}
                          placeholder="tx hash"
                        />
                      </FormField>
                      <div className={styles.walletActions}>
                        <Button
                          type="button"
                          onClick={handleConfirmHeirWalletVerify}
                          disabled={heirWalletVerifyLoading}
                        >
                          {heirWalletVerifyLoading ? "確認中..." : "所有確認を完了"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    walletDialogMode === "verify" && (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyTitle}>まずは登録してください</div>
                        <div className={styles.emptyBody}>
                          受取用ウォレットの登録後に所有確認が可能です。
                        </div>
                      </div>
                    )
                  )}
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="ghost">
                        閉じる
                      </Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>相続人のみ操作できます</div>
              <div className={styles.emptyBody}>
                受取用ウォレットの登録は相続人本人が行います。
              </div>
            </div>
          )}
        </div>
      ) : null}

      {tab === "tasks" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>タスク</h2>
            <span className={styles.badgeMuted}>進捗には影響しません</span>
          </div>
          {taskError ? <FormAlert variant="error">{taskError}</FormAlert> : null}
          {taskLoading ? <div className={styles.badgeMuted}>読み込み中...</div> : null}
          <div className={styles.taskSection}>
            <div className={styles.taskSectionHeader}>
              <h3 className={styles.taskSectionTitle}>自分用タスク</h3>
              <span className={styles.taskSectionMeta}>
                {isOwner ? "被相続人" : "相続人"}
              </span>
            </div>
            {visiblePersonalTasks.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyTitle}>個人タスクはありません</div>
                <div className={styles.emptyBody}>Todoマスターが更新されると表示されます。</div>
              </div>
            ) : (
              <div className={styles.taskList}>
                {visiblePersonalTasks.map((task) => {
                  const checked = userCompletedTaskIds.includes(task.id);
                  const walletNotice = getWalletNotice(task.id);
                  return (
                    <label key={task.id} className={styles.taskItem}>
                      <input
                        type="checkbox"
                        className={styles.taskCheckbox}
                        checked={checked}
                        disabled={!canUpdateTasks}
                        onChange={(event) =>
                          handleTogglePersonalTask(task.id, event.target.checked)
                        }
                      />
                      <span className={styles.taskContent}>
                        <span className={styles.taskDescription}>{task.description}</span>
                        {walletNotice ? (
                          <span className={styles.taskBadge}>{walletNotice}</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
