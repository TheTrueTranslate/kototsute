import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import Tabs from "../../features/shared/components/tabs";
import { Button } from "../../features/shared/components/ui/button";
import { Input } from "../../features/shared/components/ui/input";
import { Textarea } from "../../features/shared/components/ui/textarea";
import { getCase, type CaseSummary } from "../api/cases";
import { listAssets, type AssetListItem } from "../api/assets";
import { listPlans, type PlanListItem } from "../api/plans";
import { getTaskProgress, updateMyTaskProgress } from "../api/tasks";
import {
  createInvite,
  listCaseHeirs,
  listInvitesByOwner,
  type CaseHeir,
  type InviteListItem
} from "../api/invites";
import { useAuth } from "../../features/auth/auth-provider";
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

type TabKey = "assets" | "plans" | "tasks" | "heirs";

const tabItems: { key: TabKey; label: string }[] = [
  { key: "assets", label: "資産" },
  { key: "plans", label: "指図" },
  { key: "tasks", label: "タスク" },
  { key: "heirs", label: "相続人" }
];

const isTabKey = (value: string | null): value is TabKey =>
  Boolean(value && tabItems.some((item) => item.key === value));

export default function CaseDetailPage() {
  const { caseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get("tab");
  const { user } = useAuth();
  const [caseData, setCaseData] = useState<CaseSummary | null>(null);
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [ownerInvites, setOwnerInvites] = useState<InviteListItem[]>([]);
  const [heirs, setHeirs] = useState<CaseHeir[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRelation, setInviteRelation] = useState<RelationOption>(relationOptions[0]);
  const [inviteRelationOther, setInviteRelationOther] = useState("");
  const [inviteMemo, setInviteMemo] = useState("");
  const [inviting, setInviting] = useState(false);
  const [tab, setTab] = useState<TabKey>(() => (isTabKey(queryTab) ? queryTab : "assets"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [userCompletedTaskIds, setUserCompletedTaskIds] = useState<string[]>([]);

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

  useEffect(() => {
    if (!caseId) {
      setError("ケースIDが取得できません");
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const detail = await getCase(caseId);
        setCaseData(detail);
        const owner = detail.ownerUid === user?.uid;
        setIsOwner(owner);
        if (owner) {
          const [assetItems, planItems, inviteItems] = await Promise.all([
            listAssets(caseId),
            listPlans(caseId),
            listInvitesByOwner(caseId)
          ]);
          setAssets(assetItems);
          setPlans(planItems);
          setOwnerInvites(inviteItems);
          setHeirs([]);
        } else {
          const [planItems, heirItems] = await Promise.all([
            listPlans(caseId),
            listCaseHeirs(caseId)
          ]);
          setAssets([]);
          setPlans(planItems);
          setOwnerInvites([]);
          setHeirs(heirItems);
        }
      } catch (err: any) {
        setError(err?.message ?? "ケースの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    load();
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
    if (isTabKey(queryTab) && queryTab !== tab) {
      setTab(queryTab);
    } else if (queryTab && !isTabKey(queryTab)) {
      setTab("assets");
    }
  }, [queryTab, tab]);

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
              <Button asChild size="sm">
                <Link to={`/cases/${caseId}/assets/new`}>資産を追加</Link>
              </Button>
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
                    <span className={styles.statusBadge}>承認済み</span>
                  </div>
                </div>
              ))}
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
                        {task.requiresWallet ? (
                          <span className={styles.taskBadge}>ウォレット登録が必要です</span>
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
