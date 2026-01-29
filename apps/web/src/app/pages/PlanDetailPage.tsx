import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import Tabs from "../../features/shared/components/tabs";
import { Button } from "../../features/shared/components/ui/button";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../features/shared/components/ui/dialog";
import { Input } from "../../features/shared/components/ui/input";
import {
  deletePlanAsset,
  getPlan,
  listPlanAssets,
  listPlanHistory,
  removePlanHeir,
  updatePlanStatus,
  updatePlanAllocations,
  type PlanAllocation,
  type PlanAsset,
  type PlanDetail,
  type PlanStatus,
  type PlanHistoryEntry,
  type PlanToken
} from "../api/plans";
import styles from "../../styles/plansPage.module.css";

const statusLabels: Record<string, string> = {
  DRAFT: "下書き",
  SHARED: "共有中",
  INACTIVE: "無効"
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const buildTokenLabel = (token: PlanToken) => {
  if (token.isNative) return token.currency;
  return token.issuer ? `${token.currency} (${token.issuer})` : token.currency;
};

const buildUnallocatedLabel = () => "未配分";

type PlanTab = "overview" | "assets" | "heirs" | "history";

const unitTypeLabel = (value?: string | null) => (value === "AMOUNT" ? "数量" : "割合");

const sumAllocations = (allocations: PlanAllocation[]) =>
  allocations
    .filter((allocation) => !allocation.isUnallocated)
    .reduce((sum, allocation) => sum + allocation.value, 0);

const normalizeAllocations = (
  unitType: "PERCENT" | "AMOUNT",
  allocations: PlanAllocation[]
): PlanAllocation[] => {
  const cleaned = allocations
    .filter((allocation) => !allocation.isUnallocated)
    .map((allocation) => ({
      heirUid: allocation.heirUid,
      value: allocation.value,
      isUnallocated: false
    }));
  if (unitType !== "PERCENT") return cleaned;
  const sum = cleaned.reduce((total, allocation) => total + allocation.value, 0);
  if (sum < 100) {
    return [
      ...cleaned,
      { heirUid: null, value: Number((100 - sum).toFixed(6)), isUnallocated: true }
    ];
  }
  return cleaned;
};

const statusOptions: { value: PlanStatus; label: string }[] = [
  { value: "DRAFT", label: "下書き" },
  { value: "SHARED", label: "共有中" },
  { value: "INACTIVE", label: "無効" }
];

const allocationPalette = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#db2777",
  "#0ea5e9",
  "#f59e0b",
  "#14b8a6",
  "#ef4444"
];
const unallocatedColor = "#e2e8f0";

const buildHistoryMeta = (entry: PlanHistoryEntry) => {
  const meta = entry.meta ?? {};
  if (entry.type === "PLAN_ALLOCATION_UPDATED") {
    const unitType = unitTypeLabel(meta.unitType as string);
    const allocationCount = typeof meta.allocationCount === "number" ? `${meta.allocationCount}件` : null;
    const assignedTotal =
      typeof meta.assignedTotal === "number" ? `割当合計: ${meta.assignedTotal}` : null;
    const unallocated =
      typeof meta.unallocated === "number" ? `未配分: ${meta.unallocated}` : null;
    const total = typeof meta.total === "number" ? `合計: ${meta.total}` : null;
    return ["単位: " + unitType, allocationCount, assignedTotal, unallocated, total].filter(Boolean);
  }
  if (entry.type === "PLAN_ASSET_ADDED") {
    const unitType = unitTypeLabel(meta.unitType as string);
    return ["単位: " + unitType].filter(Boolean);
  }
  if (entry.type === "PLAN_HEIR_ADDED") {
    const relationLabel = typeof meta.relationLabel === "string" ? meta.relationLabel : "";
    const relationOther = typeof meta.relationOther === "string" ? meta.relationOther : "";
    const relation = relationOther ? `${relationLabel} (${relationOther})` : relationLabel;
    return relation ? [`関係: ${relation}`] : [];
  }
  if (entry.type === "PLAN_SHARED" || entry.type === "PLAN_INACTIVATED") {
    const prev = typeof meta.prevStatus === "string" ? meta.prevStatus : null;
    const next = typeof meta.nextStatus === "string" ? meta.nextStatus : null;
    const parts = [];
    if (prev && next) {
      parts.push(`状態: ${statusLabels[prev] ?? prev} → ${statusLabels[next] ?? next}`);
    }
    return parts;
  }
  return [];
};

export default function PlanDetailPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [planAssets, setPlanAssets] = useState<PlanAsset[]>([]);
  const [historyEntries, setHistoryEntries] = useState<PlanHistoryEntry[]>([]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [pendingHeirDelete, setPendingHeirDelete] = useState<{
    uid: string;
    label: string;
  } | null>(null);
  const [pendingAssetDelete, setPendingAssetDelete] = useState<{
    planAssetId: string;
    label: string;
  } | null>(null);
  const [statusDraft, setStatusDraft] = useState<PlanStatus>("DRAFT");
  const [pendingStatus, setPendingStatus] = useState<PlanStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allocationDrafts, setAllocationDrafts] = useState<Record<string, { heirUid: string; value: string }>>({});
  const [activeTab, setActiveTab] = useState<PlanTab>("overview");
  const isInactive = plan?.status === "INACTIVE";

  const heirColorMap = useMemo(() => {
    const map = new Map<string, string>();
    (plan?.heirs ?? []).forEach((heir, index) => {
      map.set(heir.uid, allocationPalette[index % allocationPalette.length]);
    });
    return map;
  }, [plan?.heirs]);

  const getAllocationColor = (allocation: PlanAllocation) => {
    if (allocation.isUnallocated || !allocation.heirUid) return unallocatedColor;
    return heirColorMap.get(allocation.heirUid) ?? "#94a3b8";
  };

  const loadDetail = async () => {
    if (!planId) return;
    setError(null);
    try {
      const [planData, planAssetData, historyData] = await Promise.all([
        getPlan(planId),
        listPlanAssets(planId),
        listPlanHistory(planId)
      ]);
      setPlan(planData);
      setPlanAssets(
        planAssetData.map((asset) => ({
          ...asset,
          allocations: normalizeAllocations(asset.unitType, asset.allocations)
        }))
      );
      setHistoryEntries(historyData);
    } catch (err: any) {
      setError(err?.message ?? "指図の取得に失敗しました");
    }
  };

  useEffect(() => {
    void loadDetail();
  }, [planId]);

  useEffect(() => {
    if (plan?.status) {
      setStatusDraft(plan.status);
    }
  }, [plan?.status]);

  const handleAllocationSave = async (planAsset: PlanAsset) => {
    if (!planId) return;
    const normalized = normalizeAllocations(planAsset.unitType, planAsset.allocations);
    const invalid = normalized.some((allocation) => allocation.value < 0);
    if (invalid) {
      setError("配分は0以上で入力してください");
      return;
    }
    if (planAsset.unitType === "PERCENT") {
      const total = sumAllocations(normalized);
      if (total > 100) {
        setError("割合の合計は100%以下にしてください");
        return;
      }
    }
    setError(null);
    try {
      await updatePlanAllocations(planId, planAsset.planAssetId, {
        unitType: planAsset.unitType,
        allocations: normalized
      });
      await loadDetail();
    } catch (err: any) {
      setError(err?.message ?? "配分の保存に失敗しました");
    }
  };

  const handleAddAllocation = (planAsset: PlanAsset) => {
    const draft = allocationDrafts[planAsset.planAssetId];
    if (!draft?.heirUid || !draft?.value) return;
    const value = Number(draft.value);
    if (!Number.isFinite(value)) {
      setError("数値を入力してください");
      return;
    }
    if (value < 0) {
      setError("配分は0以上で入力してください");
      return;
    }
    if (planAsset.unitType === "PERCENT") {
      const total = sumAllocations(planAsset.allocations) + value;
      if (total > 100) {
        setError("割合の合計は100%以下にしてください");
        return;
      }
    }
    setError(null);

    const nextAllocation: PlanAllocation = {
      heirUid: draft.heirUid,
      value
    };

    setPlanAssets((prev) =>
      prev.map((asset) => {
        if (asset.planAssetId !== planAsset.planAssetId) return asset;
        const nextAllocations = normalizeAllocations(asset.unitType, [
          ...asset.allocations,
          nextAllocation
        ]);
        return { ...asset, allocations: nextAllocations };
      })
    );
    setAllocationDrafts((prev) => ({
      ...prev,
      [planAsset.planAssetId]: { heirUid: "", value: "" }
    }));
  };

  const handleAllocationValueChange = (planAsset: PlanAsset, index: number, nextValue: string) => {
    if (isInactive) return;
    const value = nextValue === "" ? 0 : Number(nextValue);
    if (!Number.isFinite(value)) {
      setError("数値を入力してください");
      return;
    }
    if (value < 0) {
      setError("配分は0以上で入力してください");
      return;
    }

    setPlanAssets((prev) =>
      prev.map((asset) => {
        if (asset.planAssetId !== planAsset.planAssetId) return asset;
        const updated = asset.allocations.map((allocation, idx) =>
          idx === index ? { ...allocation, value } : allocation
        );
        const nextAllocations = normalizeAllocations(asset.unitType, updated);
        if (asset.unitType === "PERCENT" && sumAllocations(nextAllocations) > 100) {
          setError("割合の合計は100%以下にしてください");
        } else {
          setError(null);
        }
        return { ...asset, allocations: nextAllocations };
      })
    );
  };

  const handleRemoveAllocation = (planAsset: PlanAsset, index: number) => {
    if (isInactive) return;
    const target = planAsset.allocations[index];
    if (!target || target.isUnallocated) return;
    setPlanAssets((prev) =>
      prev.map((asset) => {
        if (asset.planAssetId !== planAsset.planAssetId) return asset;
        const nextAllocations = normalizeAllocations(
          asset.unitType,
          asset.allocations.filter((_, idx) => idx !== index)
        );
        return { ...asset, allocations: nextAllocations };
      })
    );
  };

  const handleRemoveHeir = async (heirUid: string, label: string) => {
    if (isInactive) return;
    setPendingHeirDelete({ uid: heirUid, label });
  };

  const handleConfirmRemoveHeir = async () => {
    if (!planId || !pendingHeirDelete) return;
    setError(null);
    try {
      await removePlanHeir(planId, pendingHeirDelete.uid);
      setPendingHeirDelete(null);
      await loadDetail();
    } catch (err: any) {
      setError(err?.message ?? "相続人の削除に失敗しました");
    }
  };

  const handleDeletePlanAsset = async (planAsset: PlanAsset) => {
    if (isInactive) return;
    const label = planAsset.token
      ? `${planAsset.assetLabel} / ${buildTokenLabel(planAsset.token)}`
      : planAsset.assetLabel;
    setPendingAssetDelete({ planAssetId: planAsset.planAssetId, label });
  };

  const handleConfirmDeletePlanAsset = async () => {
    if (!planId || !pendingAssetDelete) return;
    setError(null);
    try {
      await deletePlanAsset(planId, pendingAssetDelete.planAssetId);
      setPendingAssetDelete(null);
      await loadDetail();
    } catch (err: any) {
      setError(err?.message ?? "資産の削除に失敗しました");
    }
  };

  const handleShare = () => {
    setPendingStatus("SHARED");
    setIsShareModalOpen(true);
  };

  const handleStatusChange = async (nextStatus: PlanStatus) => {
    if (!planId) return;
    setError(null);
    try {
      await updatePlanStatus(planId, nextStatus);
      await loadDetail();
    } catch (err: any) {
      setError(err?.message ?? "ステータスの更新に失敗しました");
    }
  };

  const handleConfirmShare = async () => {
    if (!pendingStatus) return;
    setIsShareModalOpen(false);
    await handleStatusChange(pendingStatus);
    setPendingStatus(null);
  };

  const handleStatusSelect = (nextStatus: PlanStatus) => {
    if (nextStatus === (plan?.status ?? "DRAFT")) return;
    setStatusDraft(nextStatus);
    if (nextStatus === "SHARED") {
      handleShare();
      return;
    }
    void handleStatusChange(nextStatus);
  };

  const tabs: { key: PlanTab; label: string }[] = [
    { key: "overview", label: "基本情報" },
    { key: "assets", label: "資産" },
    { key: "heirs", label: "相続人" },
    { key: "history", label: "履歴" }
  ];

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: "指図一覧", href: "/plans" },
            { label: plan?.title ?? "指図詳細" }
          ]}
        />
        <div className={styles.headerRow}>
          <div>
            <h1 className="text-title">{plan?.title ?? "指図"}</h1>
          </div>
          <div className={styles.headerActions}>
            <Button type="button" variant="outline" onClick={() => navigate("/plans")}>一覧へ戻る</Button>
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <Tabs items={tabs} value={activeTab} onChange={(value) => setActiveTab(value as PlanTab)} />

      {activeTab === "overview" ? (
        <div className={styles.tabPanel}>
          <div className={styles.infoList}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>プラン名</span>
              <span className={styles.infoValue}>{plan?.title ?? "-"}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>最終更新</span>
              <span className={styles.infoValue}>{plan?.updatedAt ? formatDate(plan.updatedAt) : "-"}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>ステータス</span>
              <span className={styles.infoValue}>
                <select
                  className={styles.select}
                  value={statusDraft}
                  onChange={(event) => handleStatusSelect(event.target.value as PlanStatus)}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {isInactive ? <span className={styles.infoHint}>無効の指図は編集できません。</span> : null}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>共有日時</span>
              <span className={styles.infoValue}>{plan?.sharedAt ? formatDate(plan.sharedAt) : "-"}</span>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "heirs" ? (
        <div className={styles.tabPanel}>
          <div className={styles.sectionBody}>
            <div className={styles.callout}>
              <div className={styles.calloutIcon}>
                <Info className={styles.calloutIconSvg} />
              </div>
              <div className={styles.calloutBody}>
                <div className={styles.calloutTitle}>この指図に紐づいた相続人のみ表示しています。</div>
                <div className={styles.calloutText}>すべての相続人が表示されるわけではありません。</div>
                <button
                  type="button"
                  className={styles.calloutLink}
                  onClick={() => navigate("/invites")}
                  disabled={isInactive}
                >
                  相続人の追加はこちら
                </button>
              </div>
            </div>
            {plan?.heirs?.length ? (
              <div className={styles.list}>
                {plan.heirs.map((heir) => (
                  <div key={heir.uid} className={`${styles.row} ${styles.rowInline}`}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowTitle}>{heir.relationLabel || "相続人"}</div>
                      <div className={styles.rowMeta}>{heir.email}</div>
                    </div>
                    <div className={styles.rowSide}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={styles.deleteButton}
                        disabled={isInactive}
                        onClick={() =>
                          handleRemoveHeir(
                            heir.uid,
                            `${heir.relationLabel || "相続人"} / ${heir.email}`
                          )
                        }
                      >
                        削除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.helper}>相続人がまだ追加されていません。</div>
            )}
          </div>

          <Dialog open={Boolean(pendingHeirDelete)} onOpenChange={(open) => (!open ? setPendingHeirDelete(null) : null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>相続人を削除しますか？</DialogTitle>
                <DialogDescription>関連する配分も削除されます。</DialogDescription>
              </DialogHeader>
              <div className={styles.deleteSummary}>
                <span className={styles.rowMeta}>{pendingHeirDelete?.label}</span>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPendingHeirDelete(null)}>
                  キャンセル
                </Button>
                <Button type="button" variant="destructive" onClick={handleConfirmRemoveHeir}>
                  削除する
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}

      {activeTab === "assets" ? (
        <div className={styles.tabPanel}>
          <div className={styles.sectionBody}>
            <div className={styles.callout}>
              <div className={styles.calloutIcon}>
                <Info className={styles.calloutIconSvg} />
              </div>
              <div className={styles.calloutBody}>
                <div className={styles.calloutTitle}>分配予定の資産だけを一覧しています。</div>
                <div className={styles.calloutText}>すべての資産がここに表示されるわけではありません。</div>
                <button
                  type="button"
                  className={styles.calloutLink}
                  onClick={() => navigate("/assets")}
                  disabled={isInactive}
                >
                  資産の追加はこちら
                </button>
              </div>
            </div>
            {planAssets.length === 0 ? (
              <div className={styles.helper}>まだ資産が追加されていません。</div>
            ) : (
              <div className={styles.list}>
                {planAssets.map((planAsset) => {
                  const displayAllocations = normalizeAllocations(planAsset.unitType, planAsset.allocations);
                  return (
                    <div key={planAsset.planAssetId} className={styles.assetCard}>
                      <div className={styles.assetHeader}>
                        <div className={styles.assetTitle}>
                          {planAsset.assetLabel} {planAsset.token ? `- ${buildTokenLabel(planAsset.token)}` : ""}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isInactive}
                          onClick={() => handleDeletePlanAsset(planAsset)}
                        >
                          削除
                        </Button>
                      </div>
                      <div className={styles.rowMeta}>単位: {planAsset.unitType === "PERCENT" ? "割合" : "数量"}</div>
                      {planAsset.unitType === "PERCENT" && displayAllocations.length > 0 ? (
                        <div className={styles.allocationBar}>
                          {displayAllocations.map((allocation, index) => (
                            <span
                              key={`bar-${planAsset.planAssetId}-${index}`}
                              className={styles.allocationSegment}
                              style={{
                                width: `${allocation.value}%`,
                                backgroundColor: getAllocationColor(allocation)
                              }}
                              aria-label="allocation"
                            />
                          ))}
                        </div>
                      ) : null}
                      {displayAllocations.length > 0 ? (
                        <div className={styles.flow}>
                          <div className={styles.flowAssetNode}>
                            <span className={styles.flowDot} />
                            <span className={styles.flowLabel}>資産</span>
                          </div>
                          <div className={styles.flowHeirList}>
                            {displayAllocations.map((allocation, index) => {
                              const label = allocation.heirUid
                                ? plan?.heirs.find((heir) => heir.uid === allocation.heirUid)?.relationLabel ??
                                  "相続人"
                                : buildUnallocatedLabel();
                              const color = getAllocationColor(allocation);
                              return (
                                <div
                                  key={`flow-${planAsset.planAssetId}-${index}`}
                                  className={styles.flowHeirRow}
                                  style={{ "--flow-color": color } as CSSProperties}
                                >
                                  <span className={styles.flowConnector} />
                                  <div className={styles.flowHeirPill}>
                                    <span className={styles.flowHeirLabel}>{label}</span>
                                    <span className={styles.flowHeirValue}>
                                      {allocation.value}
                                      {planAsset.unitType === "PERCENT" ? "%" : ""}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      <div className={styles.divider} />
                      <div className={styles.sectionBody}>
                        {displayAllocations.length === 0 ? (
                          <div className={styles.helper}>配分がまだありません。</div>
                        ) : (
                          displayAllocations.map((allocation, index) => (
                            <div key={`${planAsset.planAssetId}-${index}`} className={styles.allocationItem}>
                              <span className={styles.rowMeta}>
                                {allocation.heirUid
                                  ? plan?.heirs.find((heir) => heir.uid === allocation.heirUid)?.relationLabel ??
                                    "相続人"
                                  : buildUnallocatedLabel()}
                              </span>
                              {allocation.isUnallocated ? (
                                <span className={styles.rowMeta}>
                                  {allocation.value}
                                  {planAsset.unitType === "PERCENT" ? "%" : ""}
                                </span>
                              ) : (
                                <Input
                                  className={styles.allocationInput}
                                  value={String(allocation.value)}
                                  disabled={isInactive}
                                  onChange={(event) =>
                                    handleAllocationValueChange(planAsset, index, event.target.value)
                                  }
                                  placeholder={planAsset.unitType === "PERCENT" ? "0〜100" : "数量"}
                                />
                              )}
                              {!allocation.isUnallocated && planAsset.unitType === "PERCENT" ? (
                                <span className={styles.unitSuffix}>%</span>
                              ) : null}
                              {!allocation.isUnallocated ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={isInactive}
                                  onClick={() => handleRemoveAllocation(planAsset, index)}
                                >
                                  解除
                                </Button>
                              ) : null}
                            </div>
                          ))
                        )}
                      <div className={styles.allocationRow}>
                        <select
                          className={styles.select}
                          value={allocationDrafts[planAsset.planAssetId]?.heirUid ?? ""}
                          disabled={isInactive}
                          onChange={(event) =>
                            setAllocationDrafts((prev) => ({
                              ...prev,
                              [planAsset.planAssetId]: {
                                heirUid: event.target.value,
                                value: prev[planAsset.planAssetId]?.value ?? ""
                              }
                            }))
                          }
                        >
                          <option value="">相続人を選択</option>
                          {plan?.heirs.map((heir) => (
                            <option key={heir.uid} value={heir.uid}>
                              {heir.relationLabel} / {heir.email}
                            </option>
                          ))}
                        </select>
                        <Input
                          value={allocationDrafts[planAsset.planAssetId]?.value ?? ""}
                          disabled={isInactive}
                          onChange={(event) =>
                            setAllocationDrafts((prev) => ({
                              ...prev,
                              [planAsset.planAssetId]: {
                                heirUid: prev[planAsset.planAssetId]?.heirUid ?? "",
                                value: event.target.value
                              }
                            }))
                          }
                          placeholder={planAsset.unitType === "PERCENT" ? "0〜100 (%)" : "数量"}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleAddAllocation(planAsset)}
                          disabled={isInactive}
                        >
                          追加
                        </Button>
                      </div>
                      {planAsset.unitType === "PERCENT" ? (
                        <div className={styles.helper}>割合は0〜100%で入力してください。</div>
                      ) : null}
                      <div className={styles.inlineRow}>
                        <Button type="button" onClick={() => handleAllocationSave(planAsset)} disabled={isInactive}>
                          配分を保存
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            )}

          </div>

          <Dialog
            open={Boolean(pendingAssetDelete)}
            onOpenChange={(open) => (!open ? setPendingAssetDelete(null) : null)}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>資産を削除しますか？</DialogTitle>
                <DialogDescription>関連する配分も削除されます。</DialogDescription>
              </DialogHeader>
              <div className={styles.deleteSummary}>
                <span className={styles.rowMeta}>{pendingAssetDelete?.label}</span>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPendingAssetDelete(null)}>
                  キャンセル
                </Button>
                <Button type="button" variant="destructive" onClick={handleConfirmDeletePlanAsset}>
                  削除する
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}

      {activeTab === "history" ? (
        <div className={styles.tabPanel}>
          <div className={styles.sectionBody}>
            {historyEntries.length === 0 ? (
              <div className={styles.helper}>履歴はまだありません。</div>
            ) : (
              <div className={styles.list}>
                {historyEntries.map((entry) => {
                  const metaRows = buildHistoryMeta(entry);
                  return (
                    <div key={entry.historyId} className={styles.row}>
                      <div className={styles.rowMain}>
                        <div className={styles.historyTitle}>
                          <span>{entry.title}</span>
                          <span className={styles.historyTime}>{formatDate(entry.createdAt)}</span>
                        </div>
                        {entry.detail ? <div className={styles.rowMeta}>{entry.detail}</div> : null}
                        {metaRows.length > 0 ? (
                          <div className={styles.historyMeta}>
                            {metaRows.map((item, index) => (
                              <span key={`${entry.historyId}-meta-${index}`} className={styles.badgeMuted}>
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <Dialog
        open={isShareModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsShareModalOpen(false);
            setPendingStatus(null);
            setStatusDraft(plan?.status ?? "DRAFT");
            return;
          }
          setIsShareModalOpen(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>指図を共有しますか？</DialogTitle>
            <DialogDescription>共有すると以下の状態になります。</DialogDescription>
          </DialogHeader>
          <div className={styles.shareNotes}>
            <div className={styles.rowMeta}>・追加済みの相続人がこの指図を閲覧できます。</div>
            <div className={styles.rowMeta}>・相続人へ共有通知が作成されます。</div>
            <div className={styles.rowMeta}>・必要に応じて後から無効にできます。</div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsShareModalOpen(false)}>
              キャンセル
            </Button>
            <Button type="button" onClick={handleConfirmShare}>
              共有する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
