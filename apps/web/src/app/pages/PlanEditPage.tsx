import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import { Button } from "../../features/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../../features/shared/components/ui/dialog";
import { Input } from "../../features/shared/components/ui/input";
import { listAssets, type AssetListItem } from "../api/assets";
import { listCaseHeirs, type CaseHeir } from "../api/invites";
import {
  addPlanHeir,
  addPlanAsset,
  deletePlanAsset,
  getPlan,
  listPlanAssets,
  removePlanHeir,
  sharePlan,
  unsharePlan,
  updatePlanAllocations,
  updatePlanTitle,
  type PlanAsset,
  type PlanDetail
} from "../api/plans";
import styles from "../../styles/plansPage.module.css";

const statusLabels: Record<string, string> = {
  DRAFT: "下書き",
  SHARED: "共有中",
  INACTIVE: "無効"
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

type AllocationDraft = {
  unitType: "PERCENT" | "AMOUNT";
  values: Record<string, string>;
};

export default function PlanEditPage() {
  const { caseId, planId } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [planAssets, setPlanAssets] = useState<PlanAsset[]>([]);
  const [caseAssets, setCaseAssets] = useState<AssetListItem[]>([]);
  const [caseHeirs, setCaseHeirs] = useState<CaseHeir[]>([]);
  const [allocationDrafts, setAllocationDrafts] = useState<Record<string, AllocationDraft>>({});
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [addingAssetId, setAddingAssetId] = useState<string | null>(null);
  const [removingAssetId, setRemovingAssetId] = useState<string | null>(null);
  const [addingHeirUid, setAddingHeirUid] = useState<string | null>(null);
  const [removingHeirUid, setRemovingHeirUid] = useState<string | null>(null);
  const [savingAllocationId, setSavingAllocationId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [unsharing, setUnsharing] = useState(false);
  const [heirModalOpen, setHeirModalOpen] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);

  const availableAssets = useMemo(() => {
    const usedIds = new Set(planAssets.map((asset) => asset.assetId));
    return caseAssets.filter((asset) => !usedIds.has(asset.assetId));
  }, [caseAssets, planAssets]);

  const planHeirUids = useMemo(
    () => new Set((plan?.heirs ?? []).map((heir) => heir.uid)),
    [plan?.heirs]
  );

  const availableHeirs = useMemo(() => {
    return caseHeirs.filter(
      (heir) => heir.acceptedByUid && !planHeirUids.has(heir.acceptedByUid)
    );
  }, [caseHeirs, planHeirUids]);

  useEffect(() => {
    if (!caseId || !planId) {
      setError("指図IDが取得できません");
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [detail, planAssetItems, caseAssetItems, heirItems] = await Promise.all([
          getPlan(caseId, planId),
          listPlanAssets(caseId, planId),
          listAssets(caseId),
          listCaseHeirs(caseId)
        ]);
        setPlan(detail);
        setTitle(detail.title ?? "");
        setPlanAssets(planAssetItems);
        setCaseAssets(caseAssetItems);
        setCaseHeirs(heirItems);
      } catch (err: any) {
        setError(err?.message ?? "指図の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [caseId, planId]);

  useEffect(() => {
    if (!plan) return;
    const nextDrafts: Record<string, AllocationDraft> = {};
    planAssets.forEach((asset) => {
      const values: Record<string, string> = {};
      plan.heirs.forEach((heir) => {
        const allocation = asset.allocations?.find((item) => item.heirUid === heir.uid);
        values[heir.uid] = allocation ? String(allocation.value) : "";
      });
      nextDrafts[asset.planAssetId] = {
        unitType: asset.unitType ?? "PERCENT",
        values
      };
    });
    setAllocationDrafts(nextDrafts);
  }, [plan, planAssets]);

  const refreshAssets = async () => {
    if (!caseId || !planId) return;
    const planAssetItems = await listPlanAssets(caseId, planId);
    setPlanAssets(planAssetItems);
  };

  const refreshPlan = async () => {
    if (!caseId || !planId) return;
    const detail = await getPlan(caseId, planId);
    setPlan(detail);
    setTitle(detail.title ?? "");
  };

  const handleSaveTitle = async () => {
    if (!caseId || !planId) {
      setError("指図IDが取得できません");
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      setError("タイトルは必須です");
      return;
    }
    setSavingTitle(true);
    setError(null);
    try {
      await updatePlanTitle(caseId, planId, trimmed);
      await refreshPlan();
    } catch (err: any) {
      setError(err?.message ?? "指図タイトルの更新に失敗しました");
    } finally {
      setSavingTitle(false);
    }
  };

  const handleAddAsset = async (assetId: string) => {
    if (!caseId || !planId) {
      setError("指図IDが取得できません");
      return;
    }
    if (!assetId) return;
    setAddingAssetId(assetId);
    setError(null);
    try {
      await addPlanAsset(caseId, planId, { assetId, unitType: "PERCENT" });
      await refreshAssets();
      await refreshPlan();
      setAssetModalOpen(false);
    } catch (err: any) {
      setError(err?.message ?? "資産の追加に失敗しました");
    } finally {
      setAddingAssetId(null);
    }
  };

  const handleRemoveAsset = async (planAssetId: string) => {
    if (!caseId || !planId) {
      setError("指図IDが取得できません");
      return;
    }
    setRemovingAssetId(planAssetId);
    setError(null);
    try {
      await deletePlanAsset(caseId, planId, planAssetId);
      await refreshAssets();
      await refreshPlan();
    } catch (err: any) {
      setError(err?.message ?? "資産の削除に失敗しました");
    } finally {
      setRemovingAssetId(null);
    }
  };

  const handleAddHeir = async (heirUid: string) => {
    if (!caseId || !planId) {
      setError("指図IDが取得できません");
      return;
    }
    setAddingHeirUid(heirUid);
    setError(null);
    try {
      await addPlanHeir(caseId, planId, heirUid);
      await refreshPlan();
      await refreshAssets();
      setHeirModalOpen(false);
    } catch (err: any) {
      setError(err?.message ?? "相続人の追加に失敗しました");
    } finally {
      setAddingHeirUid(null);
    }
  };

  const handleRemoveHeir = async (heirUid: string) => {
    if (!caseId || !planId) {
      setError("指図IDが取得できません");
      return;
    }
    setRemovingHeirUid(heirUid);
    setError(null);
    try {
      await removePlanHeir(caseId, planId, heirUid);
      await refreshPlan();
      await refreshAssets();
    } catch (err: any) {
      setError(err?.message ?? "相続人の削除に失敗しました");
    } finally {
      setRemovingHeirUid(null);
    }
  };

  const handleAllocationChange = (planAssetId: string, heirUid: string, value: string) => {
    setAllocationDrafts((prev) => {
      const current = prev[planAssetId] ?? { unitType: "PERCENT", values: {} };
      return {
        ...prev,
        [planAssetId]: {
          ...current,
          values: {
            ...current.values,
            [heirUid]: value
          }
        }
      };
    });
  };

  const handleAllocationUnitChange = (planAssetId: string, unitType: "PERCENT" | "AMOUNT") => {
    setAllocationDrafts((prev) => {
      const current = prev[planAssetId] ?? { unitType, values: {} };
      return {
        ...prev,
        [planAssetId]: {
          ...current,
          unitType
        }
      };
    });
  };

  const parseAllocationValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const handleSaveAllocations = async (planAssetId: string) => {
    if (!caseId || !planId || !plan) {
      setError("指図IDが取得できません");
      return;
    }
    const draft = allocationDrafts[planAssetId];
    if (!draft) return;
    setSavingAllocationId(planAssetId);
    setError(null);
    try {
      const allocations = plan.heirs.map((heir) => ({
        heirUid: heir.uid,
        value: parseAllocationValue(draft.values[heir.uid] ?? "")
      }));
      await updatePlanAllocations(caseId, planId, planAssetId, {
        unitType: draft.unitType,
        allocations
      });
      await refreshAssets();
    } catch (err: any) {
      setError(err?.message ?? "配分の更新に失敗しました");
    } finally {
      setSavingAllocationId(null);
    }
  };

  const handleShare = async () => {
    if (!caseId || !planId) {
      setError("指図IDが取得できません");
      return;
    }
    setSharing(true);
    setError(null);
    try {
      await sharePlan(caseId, planId);
      await refreshPlan();
    } catch (err: any) {
      setError(err?.message ?? "指図の共有に失敗しました");
    } finally {
      setSharing(false);
    }
  };

  const handleUnshare = async () => {
    if (!caseId || !planId) {
      setError("指図IDが取得できません");
      return;
    }
    setUnsharing(true);
    setError(null);
    try {
      await unsharePlan(caseId, planId);
      await refreshPlan();
    } catch (err: any) {
      setError(err?.message ?? "共有の解除に失敗しました");
    } finally {
      setUnsharing(false);
    }
  };

  const canSaveTitle =
    Boolean(title.trim()) && title.trim() !== (plan?.title ?? "") && !savingTitle;

  const renderRelationLabel = (relationLabel?: string | null, relationOther?: string | null) => {
    if (!relationLabel) return "相続人";
    if (relationLabel === "その他") return relationOther ?? "その他";
    return relationLabel;
  };

  const palette = [
    "#2563eb",
    "#f59e0b",
    "#16a34a",
    "#ef4444",
    "#14b8a6",
    "#8b5cf6",
    "#f97316",
    "#0ea5e9",
    "#db2777"
  ];

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: "ケース", href: "/cases" },
            caseId ? { label: "ケース詳細", href: `/cases/${caseId}` } : { label: "ケース詳細" },
            { label: "指図編集" }
          ]}
        />
        <div className={styles.headerRow}>
          <div className={styles.rowMain}>
            <h1 className="text-title">{plan?.title ?? "指図編集"}</h1>
            {plan ? (
              <div className={styles.rowSide}>
                <span className={styles.statusBadge}>
                  {statusLabels[plan.status] ?? plan.status}
                </span>
                <span className={styles.rowMeta}>更新: {formatDate(plan.updatedAt)}</span>
              </div>
            ) : null}
          </div>
          <div className={styles.headerActions}>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                navigate(caseId && planId ? `/cases/${caseId}/plans/${planId}` : "/cases")
              }
            >
              指図詳細へ戻る
            </Button>
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <div className={styles.callout}>
        <div className={styles.calloutIcon}>
          <span className={styles.badgeMuted}>STEP</span>
        </div>
        <div className={styles.calloutBody}>
          <div className={styles.calloutTitle}>編集の流れ</div>
          <div className={styles.calloutText}>基本情報 → 相続人 → 資産 → 配分 → 共有</div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>1. 基本情報</h2>
        <div className={styles.sectionBody}>
          <FormField label="タイトル">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例: 分配プラン"
            />
          </FormField>
          <div className={styles.inlineRow}>
            <Button type="button" onClick={handleSaveTitle} disabled={!canSaveTitle}>
              {savingTitle ? "保存中..." : "タイトルを更新"}
            </Button>
            {plan?.status === "SHARED" ? (
              <span className={styles.badgeMuted}>共有中の指図です</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>2. 相続人</h2>
        <div className={styles.assetHeader}>
          <div className={styles.helper}>承認済みの相続人を指図に追加します。</div>
          <Dialog open={heirModalOpen} onOpenChange={setHeirModalOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm">
                相続人を追加
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>相続人を追加</DialogTitle>
              </DialogHeader>
              {availableHeirs.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyTitle}>追加できる相続人がいません</div>
                  <div className={styles.emptyBody}>
                    招待が承認されるとここに表示されます。
                  </div>
                </div>
              ) : (
                <div className={styles.sectionBody}>
                  {availableHeirs.map((heir) => (
                    <div key={heir.acceptedByUid ?? heir.inviteId} className={styles.assetCard}>
                      <div className={styles.assetHeader}>
                        <div>
                          <div className={styles.assetTitle}>{heir.email}</div>
                          <div className={styles.rowMeta}>
                            {renderRelationLabel(heir.relationLabel, heir.relationOther)}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => heir.acceptedByUid && handleAddHeir(heir.acceptedByUid)}
                          disabled={!heir.acceptedByUid || addingHeirUid === heir.acceptedByUid}
                        >
                          {addingHeirUid === heir.acceptedByUid ? "追加中..." : "追加する"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setHeirModalOpen(false)}>
                  閉じる
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? null : plan?.heirs?.length ? (
          <div className={styles.sectionBody}>
            {plan.heirs.map((heir) => (
              <div key={heir.uid} className={styles.assetCard}>
                <div className={styles.assetHeader}>
                  <div className={styles.assetTitle}>{heir.email}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveHeir(heir.uid)}
                    disabled={removingHeirUid === heir.uid}
                  >
                    {removingHeirUid === heir.uid ? "削除中..." : "削除"}
                  </Button>
                </div>
                <div className={styles.rowMeta}>
                  {renderRelationLabel(heir.relationLabel, heir.relationOther)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>指図に追加された相続人がいません</div>
            <div className={styles.emptyBody}>まずは相続人を追加してください。</div>
          </div>
        )}

      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>3. 含める資産</h2>
        <div className={styles.assetHeader}>
          <div className={styles.helper}>ケースに登録済みの資産を追加します。</div>
          <Dialog open={assetModalOpen} onOpenChange={setAssetModalOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm">
                資産を追加
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>資産を追加</DialogTitle>
              </DialogHeader>
              {availableAssets.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyTitle}>追加できる資産がありません</div>
                  <div className={styles.emptyBody}>
                    ケースに資産を登録するとここに表示されます。
                  </div>
                </div>
              ) : (
                <div className={styles.sectionBody}>
                  {availableAssets.map((asset) => (
                    <div key={asset.assetId} className={styles.assetCard}>
                      <div className={styles.assetHeader}>
                        <div>
                          <div className={styles.assetTitle}>{asset.label}</div>
                          <div className={styles.rowMeta}>{asset.address}</div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleAddAsset(asset.assetId)}
                          disabled={addingAssetId === asset.assetId}
                        >
                          {addingAssetId === asset.assetId ? "追加中..." : "追加する"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAssetModalOpen(false)}>
                  閉じる
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? null : planAssets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>まだ資産が登録されていません</div>
            <div className={styles.emptyBody}>指図に含める資産を追加してください。</div>
          </div>
        ) : (
          <div className={styles.sectionBody}>
            {planAssets.map((asset) => (
              <div key={asset.planAssetId} className={styles.assetCard}>
                <div className={styles.assetHeader}>
                  <div className={styles.assetTitle}>{asset.assetLabel || "未設定"}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAsset(asset.planAssetId)}
                    disabled={removingAssetId === asset.planAssetId}
                  >
                    {removingAssetId === asset.planAssetId ? "削除中..." : "削除"}
                  </Button>
                </div>
                <div className={styles.rowMeta}>{asset.assetAddress ?? "-"}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>4. 配分</h2>
        {loading ? null : !plan ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>指図が読み込めません</div>
            <div className={styles.emptyBody}>再読み込みしてからもう一度お試しください。</div>
          </div>
        ) : planAssets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>配分できる資産がありません</div>
            <div className={styles.emptyBody}>まずは指図に資産を追加してください。</div>
          </div>
        ) : plan.heirs.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>相続人が未設定です</div>
            <div className={styles.emptyBody}>相続人を追加してから配分を設定してください。</div>
          </div>
        ) : (
          <div className={styles.sectionBody}>
            {planAssets.map((asset) => {
              const draft = allocationDrafts[asset.planAssetId];
              const unitType = draft?.unitType ?? asset.unitType ?? "PERCENT";
              const values = plan.heirs.map((heir) =>
                parseAllocationValue(draft?.values?.[heir.uid] ?? "")
              );
              const total = values.reduce((sum, value) => sum + value, 0);
              const unallocated =
                unitType === "PERCENT"
                  ? Math.max(0, Number((100 - total).toFixed(6)))
                  : null;
              const totalForBar = unitType === "PERCENT" ? 100 : total || 1;
              const heirColors = plan.heirs.map((heir, index) => ({
                heir,
                color: palette[index % palette.length]
              }));
              const segments = heirColors
                .map(({ heir, color }, index) => {
                  const value = values[index] ?? 0;
                  const percent = totalForBar > 0 ? (value / totalForBar) * 100 : 0;
                  return {
                    key: heir.uid,
                    label: heir.email,
                    value,
                    percent,
                    color
                  };
                })
                .filter((segment) => segment.percent > 0);
              const unallocatedSegment =
                unitType === "PERCENT" && unallocated && unallocated > 0
                  ? {
                      key: "unallocated",
                      label: "未分配",
                      value: unallocated,
                      percent: (unallocated / 100) * 100,
                      color: "#e2e8f0"
                    }
                  : null;
              const isSaving = savingAllocationId === asset.planAssetId;
              const unitLabel = unitType === "PERCENT" ? "%" : "金額";
              return (
                <div key={asset.planAssetId} className={styles.assetCard}>
                  <div className={styles.assetHeader}>
                    <div>
                      <div className={styles.assetTitle}>{asset.assetLabel || "未設定"}</div>
                      <div className={styles.rowMeta}>{asset.assetAddress ?? "-"}</div>
                    </div>
                    <div className={styles.inlineRow}>
                      <select
                        className={styles.select}
                        value={unitType}
                        onChange={(event) =>
                          handleAllocationUnitChange(
                            asset.planAssetId,
                            event.target.value === "AMOUNT" ? "AMOUNT" : "PERCENT"
                          )
                        }
                        disabled={isSaving}
                      >
                        <option value="PERCENT">割合</option>
                        <option value="AMOUNT">金額</option>
                      </select>
                      <Button
                        type="button"
                        onClick={() => handleSaveAllocations(asset.planAssetId)}
                        disabled={isSaving}
                      >
                        {isSaving ? "保存中..." : "配分を保存"}
                      </Button>
                    </div>
                  </div>
                  <div className={styles.sectionBody}>
                    <div className={styles.allocationBar} aria-hidden="true">
                      {segments.map((segment) => (
                        <div
                          key={segment.key}
                          className={styles.allocationSegment}
                          style={{
                            flexBasis: `${segment.percent}%`,
                            backgroundColor: segment.color
                          }}
                        />
                      ))}
                      {unallocatedSegment ? (
                        <div
                          key={unallocatedSegment.key}
                          className={styles.allocationSegment}
                          style={{
                            flexBasis: `${unallocatedSegment.percent}%`,
                            backgroundColor: unallocatedSegment.color
                          }}
                        />
                      ) : null}
                    </div>
                    {plan.heirs.map((heir) => (
                      <div key={`${asset.planAssetId}-${heir.uid}`} className={styles.allocationRow}>
                        <div className={styles.allocationItem}>
                          <span
                            className={styles.flowDot}
                            style={{
                              backgroundColor:
                                heirColors.find((item) => item.heir.uid === heir.uid)?.color ??
                                "#64748b"
                            }}
                          />
                          <span>{heir.email}</span>
                          <span className={styles.badgeMuted}>
                            {renderRelationLabel(heir.relationLabel, heir.relationOther)}
                          </span>
                        </div>
                        <Input
                          className={styles.allocationInput}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step={unitType === "PERCENT" ? "0.01" : "1"}
                          value={draft?.values?.[heir.uid] ?? ""}
                          onChange={(event) =>
                            handleAllocationChange(asset.planAssetId, heir.uid, event.target.value)
                          }
                        />
                        <span className={styles.unitSuffix}>{unitLabel}</span>
                      </div>
                    ))}
                    {unitType === "PERCENT" ? (
                      <div className={styles.rowMeta}>
                        合計: {Number(total.toFixed(6))}% / 未分配: {unallocated}%
                      </div>
                    ) : (
                      <div className={styles.rowMeta}>合計: {Number(total.toFixed(6))}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>5. 共有</h2>
        <div className={styles.sectionBody}>
          <div className={styles.shareNotes}>
            <p className={styles.helper}>
              共有すると相続人の画面に指図が表示されます。共有済みの指図は「共有中」として扱われます。
            </p>
            <p className={styles.helper}>
              共有済みの指図同士で同じ資産を含むことはできません。
            </p>
          </div>
          <div className={styles.inlineRow}>
            <Button
              type="button"
              onClick={handleShare}
              disabled={sharing || plan?.status === "SHARED" || planAssets.length === 0}
            >
              {plan?.status === "SHARED"
                ? "共有済み"
                : sharing
                  ? "共有中..."
                  : "共有する"}
            </Button>
            {plan?.status === "SHARED" ? (
              <Button type="button" variant="outline" onClick={handleUnshare} disabled={unsharing}>
                {unsharing ? "戻し中..." : "共有を戻す"}
              </Button>
            ) : null}
            {planAssets.length === 0 ? (
              <span className={styles.badgeMuted}>資産を追加すると共有できます</span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
