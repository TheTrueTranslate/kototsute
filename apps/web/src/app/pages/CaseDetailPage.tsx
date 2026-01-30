import { useEffect, useMemo, useState } from "react";
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
import { getTaskProgress, updateMyTaskProgress } from "../api/tasks";
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
  dropsToXrpInput,
  normalizeNumberInput,
  xrpToDropsInput
} from "../../features/shared/lib/xrp-amount";
import { shouldAutoRequestChallenge } from "../../features/shared/lib/auto-challenge";
import { shouldCloseWalletDialogOnVerify } from "../../features/shared/lib/wallet-dialog";
import styles from "../../styles/caseDetailPage.module.css";
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
  DRAFT: "下書き",
  SHARED: "共有中",
  INACTIVE: "無効"
};

const walletStatusLabels: Record<string, string> = {
  UNREGISTERED: "未登録",
  PENDING: "未確認",
  VERIFIED: "確認済み"
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

type TabKey = "assets" | "plans" | "tasks" | "heirs" | "wallet";

type CaseDetailPageProps = {
  initialTab?: TabKey;
  initialIsOwner?: boolean | null;
  initialCaseData?: CaseSummary | null;
  initialHeirWallet?: HeirWallet | null;
  initialTaskIds?: string[];
  initialHeirs?: CaseHeir[];
  initialWalletDialogOpen?: boolean;
  initialWalletDialogMode?: "register" | "verify";
};

const baseTabItems: { key: TabKey; label: string }[] = [
  { key: "assets", label: "資産" },
  { key: "plans", label: "指図" },
  { key: "tasks", label: "タスク" },
  { key: "heirs", label: "相続人" }
];

const allTabKeys: TabKey[] = ["assets", "plans", "tasks", "heirs", "wallet"];

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
  initialWalletDialogMode = "register"
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
  const [heirWalletSaving, setHeirWalletSaving] = useState(false);
  const [heirWalletVerifyLoading, setHeirWalletVerifyLoading] = useState(false);
  const [heirWalletVerifyError, setHeirWalletVerifyError] = useState<string | null>(null);
  const [heirWalletVerifySuccess, setHeirWalletVerifySuccess] = useState<string | null>(null);
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
  const tabItems = useMemo(() => {
    if (isOwner === false) {
      return [
        baseTabItems[0],
        baseTabItems[1],
        baseTabItems[2],
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
            {caseId && isOwner ? (
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
            {caseId && isOwner ? (
              <Button asChild size="sm">
                <Link to={`/cases/${caseId}/plans/new`}>指図を作成</Link>
              </Button>
            ) : null}
          </div>
          {loading ? null : plans.length === 0 ? (
            <div className={styles.emptyState}>
              {isOwner === false ? (
                <>
                  <div className={styles.emptyTitle}>共有された指図がありません</div>
                  <div className={styles.emptyBody}>
                    共有された指図がある場合はここに表示されます。
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

      {tab === "heirs" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>相続人</h2>
          </div>
          {isOwner ? (
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
