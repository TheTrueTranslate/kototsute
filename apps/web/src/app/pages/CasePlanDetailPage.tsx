import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import Tabs from "../../features/shared/components/tabs";
import { Button } from "../../features/shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../../features/shared/components/ui/dialog";
import {
  deletePlan,
  getPlan,
  listPlanAssets,
  listPlanHistory,
  type PlanAsset,
  type PlanDetail,
  type PlanHistoryEntry
} from "../api/plans";
import { getCase, type CaseSummary } from "../api/cases";
import { listCaseHeirs, type CaseHeir } from "../api/invites";
import { useAuth } from "../../features/auth/auth-provider";
import styles from "../../styles/caseDetailPage.module.css";

const statusLabels: Record<string, string> = {
  DRAFT: "作成中",
  SHARED: "有効",
  INACTIVE: "無効"
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const formatAllocationValue = (value: number, unitType: "PERCENT" | "AMOUNT") => {
  if (!Number.isFinite(value)) return "-";
  return unitType === "PERCENT" ? `${value}%` : `${value}`;
};

type TabKey = "summary" | "assets" | "heirs" | "history";

const tabItems: { key: TabKey; label: string }[] = [
  { key: "summary", label: "概要" },
  { key: "assets", label: "内容" },
  { key: "heirs", label: "相続人" },
  { key: "history", label: "履歴" }
];

type CasePlanDetailPageProps = {
  initialCaseData?: CaseSummary | null;
};

export default function CasePlanDetailPage({ initialCaseData = null }: CasePlanDetailPageProps) {
  const { caseId, planId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [caseData, setCaseData] = useState<CaseSummary | null>(initialCaseData);
  const [assets, setAssets] = useState<PlanAsset[]>([]);
  const [heirs, setHeirs] = useState<CaseHeir[]>([]);
  const [history, setHistory] = useState<PlanHistoryEntry[]>([]);
  const [tab, setTab] = useState<TabKey>("summary");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const title = useMemo(() => plan?.title ?? "指図詳細", [plan]);
  const isOwner = useMemo(() => {
    if (plan?.ownerUid && user?.uid) {
      return plan.ownerUid === user.uid;
    }
    if (caseData?.ownerUid && user?.uid) {
      return caseData.ownerUid === user.uid;
    }
    return false;
  }, [plan?.ownerUid, caseData?.ownerUid, user?.uid]);
  const isLocked = caseData?.assetLockStatus === "LOCKED";
  const hasAssets = assets.length > 0;
  const canDelete = !loading && !hasAssets;

  useEffect(() => {
    if (!caseId || initialCaseData) return;
    getCase(caseId)
      .then((data) => setCaseData(data))
      .catch(() => setCaseData(null));
  }, [caseId, initialCaseData]);

  useEffect(() => {
    if (!caseId || !planId) {
      setError("指図IDが取得できません");
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const [detail, assetItems, heirItems] = await Promise.all([
          getPlan(caseId, planId),
          listPlanAssets(caseId, planId),
          listCaseHeirs(caseId)
        ]);
        setPlan(detail);
        setAssets(assetItems);
        setHeirs(heirItems);
        const historyItems = await listPlanHistory(caseId, planId).catch(() => []);
        setHistory(historyItems);
      } catch (err: any) {
        setError(err?.message ?? "指図の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [caseId, planId]);

  const handleDelete = async () => {
    if (!caseId || !planId) {
      setDeleteError("指図IDが取得できません");
      return;
    }
    setDeleteError(null);
    setDeleting(true);
    try {
      await deletePlan(caseId, planId);
      navigate(`/cases/${caseId}`);
    } catch (err: any) {
      setDeleteError(err?.message ?? "指図の削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: "ケース", href: "/cases" },
            caseId ? { label: "ケース詳細", href: `/cases/${caseId}` } : { label: "ケース詳細" },
            { label: "指図" }
          ]}
        />
        <div className={styles.headerRow}>
          <div className={styles.headerMain}>
            <h1 className="text-title">{title}</h1>
            {plan ? (
              <div className={styles.headerMeta}>
                <span className={styles.statusBadge}>
                  {statusLabels[plan.status] ?? plan.status}
                </span>
                <span className={styles.metaText}>更新: {formatDate(plan.updatedAt)}</span>
              </div>
            ) : null}
          </div>
          {isOwner && caseId && planId && !isLocked ? (
            <div className={styles.headerActions}>
              <Button asChild size="sm">
                <Link to={`/cases/${caseId}/plans/${planId}/edit`}>編集する</Link>
              </Button>
              <Dialog
                open={deleteOpen}
                onOpenChange={(open) => {
                  setDeleteOpen(open);
                  if (!open) setDeleteError(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={!canDelete || deleting}>
                    指図を削除
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>指図を削除しますか？</DialogTitle>
                    <DialogDescription>
                      資産が追加されていない指図のみ削除できます。
                    </DialogDescription>
                  </DialogHeader>
                  {deleteError ? <FormAlert variant="error">{deleteError}</FormAlert> : null}
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="ghost">キャンセル</Button>
                    </DialogClose>
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={!canDelete || deleting}
                    >
                      {deleting ? "削除中..." : "削除する"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : null}
        </div>
        {isOwner && !isLocked && hasAssets ? (
          <div className={styles.muted}>資産が追加されているため削除できません。</div>
        ) : null}
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <Tabs items={tabItems} value={tab} onChange={(value) => setTab(value as TabKey)} />

      {tab === "summary" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>概要</h2>
          </div>
          {loading ? null : plan ? (
            <div className={styles.list}>
              <div className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>最終更新</div>
                  <div className={styles.rowMeta}>{formatDate(plan.updatedAt)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>指図が見つかりません</div>
              <div className={styles.emptyBody}>アクセス権限を確認してください。</div>
            </div>
          )}
        </div>
      ) : null}

      {tab === "assets" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>内容</h2>
          </div>
          {loading ? null : assets.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>指図に含まれる資産がありません</div>
              <div className={styles.emptyBody}>指図に設定した資産がここに表示されます。</div>
            </div>
          ) : (
            <div className={styles.list}>
              {assets.map((asset) => (
                <div key={asset.planAssetId} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{asset.assetLabel || "未設定"}</div>
                    <div className={styles.rowMeta}>{asset.assetAddress ?? "-"}</div>
                    {asset.allocations?.length ? (
                      <div className={styles.allocations}>
                        {asset.allocations.map((allocation, index) => {
                          const heirLabel =
                            allocation.isUnallocated || !allocation.heirUid
                              ? "未分配"
                              : heirs.find((heir) => heir.acceptedByUid === allocation.heirUid)
                                  ?.email ?? "未登録";
                          return (
                            <div
                              key={`${asset.planAssetId}-${index}`}
                              className={styles.allocationRow}
                            >
                              <span className={styles.allocationLabel}>{heirLabel}</span>
                              <span className={styles.allocationValue}>
                                {formatAllocationValue(allocation.value, asset.unitType)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={styles.rowMeta}>分配が設定されていません</div>
                    )}
                  </div>
                  <div className={styles.rowSide}>
                    {asset.unitType === "AMOUNT" ? "金額" : "割合"}
                  </div>
                </div>
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
          {loading ? null : heirs.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>承認済みの相続人がいません</div>
              <div className={styles.emptyBody}>招待が承認されるとここに表示されます。</div>
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
                  <div className={styles.rowSide}>承認済み</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "history" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>履歴</h2>
          </div>
          {loading ? null : history.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>履歴はまだありません</div>
              <div className={styles.emptyBody}>指図の操作履歴がここに表示されます。</div>
            </div>
          ) : (
            <div className={styles.list}>
              {history.map((entry) => (
                <div key={entry.historyId} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.historyTitle}>
                      <span>{entry.title}</span>
                      {entry.detail ? (
                        <span className={styles.badgeMuted}>{entry.detail}</span>
                      ) : null}
                    </div>
                    <div className={styles.historyMeta}>
                      <span className={styles.historyTime}>{formatDateTime(entry.createdAt)}</span>
                      {entry.actorEmail ? (
                        <span className={styles.badgeMuted}>{entry.actorEmail}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
