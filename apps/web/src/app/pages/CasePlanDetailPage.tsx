import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { getRelationOptionKey, relationOtherValue } from "@kototsute/shared";
import styles from "../../styles/caseDetailPage.module.css";

const formatAllocationValue = (value: number, unitType: "PERCENT" | "AMOUNT") => {
  if (!Number.isFinite(value)) return "-";
  return unitType === "PERCENT" ? `${value}%` : `${value}`;
};

type TabKey = "assets" | "heirs" | "history";
const allTabKeys: TabKey[] = ["assets", "heirs", "history"];
const isTabKey = (value: string | null): value is TabKey =>
  Boolean(value && allTabKeys.includes(value as TabKey));

type CasePlanDetailPageProps = {
  initialCaseData?: CaseSummary | null;
};

export const resolvePlanHeirs = (plan: PlanDetail, caseHeirs: CaseHeir[]) => {
  const orderedHeirUids = Array.isArray(plan.heirUids)
    ? plan.heirUids.filter(
        (uid): uid is string => typeof uid === "string" && uid.trim().length > 0
      )
    : [];
  if (orderedHeirUids.length === 0) return [];

  const heirUidSet = new Set(orderedHeirUids);
  const caseHeirMap = new Map<string, CaseHeir>();
  for (const heir of caseHeirs) {
    const uid = heir.acceptedByUid;
    if (!uid || !heirUidSet.has(uid) || caseHeirMap.has(uid)) continue;
    caseHeirMap.set(uid, heir);
  }

  const planHeirMap = new Map<
    string,
    { email: string; relationLabel: string; relationOther: string | null }
  >();
  for (const heir of plan.heirs) {
    if (!heir?.uid || !heirUidSet.has(heir.uid) || planHeirMap.has(heir.uid)) continue;
    planHeirMap.set(heir.uid, {
      email: heir.email ?? "",
      relationLabel: heir.relationLabel ?? "",
      relationOther: heir.relationOther ?? null
    });
  }

  return orderedHeirUids.map((uid) => {
    const matched = caseHeirMap.get(uid);
    if (matched) return matched;

    const fallback = planHeirMap.get(uid);
    return {
      inviteId: `plan-heir-${uid}`,
      email: fallback?.email ?? "",
      relationLabel: fallback?.relationLabel ?? "",
      relationOther: fallback?.relationOther ?? null,
      acceptedByUid: uid,
      acceptedAt: null
    };
  });
};

export default function CasePlanDetailPage({ initialCaseData = null }: CasePlanDetailPageProps) {
  const { caseId, planId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get("tab");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [caseData, setCaseData] = useState<CaseSummary | null>(initialCaseData);
  const [assets, setAssets] = useState<PlanAsset[]>([]);
  const [heirs, setHeirs] = useState<CaseHeir[]>([]);
  const [history, setHistory] = useState<PlanHistoryEntry[]>([]);
  const [tab, setTab] = useState<TabKey>(() => (isTabKey(queryTab) ? queryTab : "assets"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const statusLabels: Record<string, string> = {
    DRAFT: t("plans.status.draft"),
    SHARED: t("plans.status.shared"),
    INACTIVE: t("plans.status.inactive")
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString(i18n.language);
  };

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString(i18n.language);
  };

  const tabItems: { key: TabKey; label: string }[] = [
    { key: "assets", label: t("plans.detail.tabs.assets") },
    { key: "heirs", label: t("plans.detail.tabs.heirs") },
    { key: "history", label: t("plans.detail.tabs.history") }
  ];

  const title = useMemo(() => plan?.title ?? t("plans.detail.title"), [plan, t]);
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
      setError("plans.detail.error.planIdMissing");
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
        setHeirs(resolvePlanHeirs(detail, heirItems));
        const historyItems = await listPlanHistory(caseId, planId).catch(() => []);
        setHistory(historyItems);
      } catch (err: any) {
        setError(err?.message ?? "plans.detail.error.fetchFailed");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [caseId, planId]);

  useEffect(() => {
    const resolved = isTabKey(queryTab) ? queryTab : "assets";
    if (resolved !== tab) {
      setTab(resolved);
    }
  }, [queryTab, tab]);

  const handleDelete = async () => {
    if (!caseId || !planId) {
      setDeleteError("plans.detail.error.planIdMissing");
      return;
    }
    setDeleteError(null);
    setDeleting(true);
    try {
      await deletePlan(caseId, planId);
      navigate(`/cases/${caseId}`);
    } catch (err: any) {
      setDeleteError(err?.message ?? "plans.detail.error.deleteFailed");
    } finally {
      setDeleting(false);
    }
  };

  const renderRelationLabel = (relationLabel?: string | null, relationOther?: string | null) => {
    if (!relationLabel) return t("common.unset");
    if (relationLabel === relationOtherValue) {
      return relationOther?.trim() ? relationOther : t("relations.other");
    }
    const relationKey = getRelationOptionKey(relationLabel);
    return relationKey ? t(relationKey) : relationLabel;
  };

  const handleTabChange = (value: string) => {
    if (!isTabKey(value)) return;
    setTab(value);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", value);
    setSearchParams(nextParams, { replace: true });
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
            { label: t("plans.detail.breadcrumb") }
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
                <span className={styles.metaText}>
                  {t("plans.detail.updatedAt", { date: formatDate(plan.updatedAt) })}
                </span>
              </div>
            ) : null}
          </div>
          {isOwner && caseId && planId && !isLocked ? (
            <div className={styles.headerActions}>
              <Button asChild size="sm">
                <Link to={`/cases/${caseId}/plans/${planId}/edit`}>
                  {t("plans.detail.actions.edit")}
                </Link>
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
                    {t("plans.detail.actions.delete")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("plans.detail.deleteDialog.title")}</DialogTitle>
                    <DialogDescription>
                      {t("plans.detail.deleteDialog.description")}
                    </DialogDescription>
                  </DialogHeader>
                  {deleteError ? (
                    <FormAlert variant="error">{t(deleteError)}</FormAlert>
                  ) : null}
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="ghost">{t("common.cancel")}</Button>
                    </DialogClose>
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={!canDelete || deleting}
                    >
                      {deleting
                        ? t("plans.detail.actions.deleting")
                        : t("plans.detail.actions.confirmDelete")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : null}
        </div>
        {isOwner && !isLocked && hasAssets ? (
          <div className={styles.muted}>{t("plans.detail.deleteLocked")}</div>
        ) : null}
      </header>

      {error ? <FormAlert variant="error">{t(error)}</FormAlert> : null}

      <Tabs items={tabItems} value={tab} onChange={handleTabChange} />

      {tab === "assets" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{t("plans.detail.assets.title")}</h2>
          </div>
          {loading ? null : assets.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>{t("plans.detail.assets.empty.title")}</div>
              <div className={styles.emptyBody}>{t("plans.detail.assets.empty.body")}</div>
            </div>
          ) : (
            <div className={styles.list}>
              {assets.map((asset) => (
                <div key={asset.planAssetId} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>
                      {asset.assetLabel || t("common.unset")}
                    </div>
                    <div className={styles.rowMeta}>{asset.assetAddress ?? "-"}</div>
                    {asset.allocations?.length ? (
                      <div className={styles.allocations}>
                        {asset.allocations.map((allocation, index) => {
                          const heirLabel =
                            allocation.isUnallocated || !allocation.heirUid
                              ? t("plans.edit.allocations.unallocated")
                              : heirs.find((heir) => heir.acceptedByUid === allocation.heirUid)
                                  ?.email ?? t("common.unregistered");
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
                      <div className={styles.rowMeta}>
                        {t("plans.detail.assets.allocationsEmpty")}
                      </div>
                    )}
                  </div>
                  <div className={styles.rowSide}>
                    {asset.unitType === "AMOUNT"
                      ? t("plans.edit.allocations.unit.amount")
                      : t("plans.edit.allocations.unit.percent")}
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
            <h2 className={styles.panelTitle}>{t("plans.detail.heirs.title")}</h2>
          </div>
          {loading ? null : heirs.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>{t("plans.detail.heirs.empty.title")}</div>
              <div className={styles.emptyBody}>{t("plans.detail.heirs.empty.body")}</div>
            </div>
          ) : (
            <div className={styles.list}>
              {heirs.map((heir) => (
                <div key={heir.inviteId} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{heir.email}</div>
                    <div className={styles.rowMeta}>
                      {t("plans.detail.heirs.relation")}:{" "}
                      {renderRelationLabel(heir.relationLabel, heir.relationOther)}
                    </div>
                  </div>
                  <div className={styles.rowSide}>{t("plans.detail.heirs.accepted")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "history" ? (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{t("plans.detail.history.title")}</h2>
          </div>
          {loading ? null : history.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyTitle}>{t("plans.detail.history.empty.title")}</div>
              <div className={styles.emptyBody}>{t("plans.detail.history.empty.body")}</div>
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
