import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { relationOtherValue } from "@kototsute/shared";
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
  updatePlanAllocations,
  updatePlanTitle,
  type PlanAsset,
  type PlanDetail
} from "../api/plans";
import styles from "../../styles/plansPage.module.css";

type AllocationDraft = {
  unitType: "PERCENT" | "AMOUNT";
  values: Record<string, string>;
};

export default function PlanEditPage() {
  const { caseId, planId } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
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
  const [heirModalOpen, setHeirModalOpen] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);

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
      setError(t("plans.edit.error.planIdMissing"));
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
        setError(err?.message ?? t("plans.edit.error.loadFailed"));
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
      setError(t("plans.edit.error.planIdMissing"));
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("validation.plan.title.required"));
      return;
    }
    setSavingTitle(true);
    setError(null);
    try {
      await updatePlanTitle(caseId, planId, trimmed);
      await refreshPlan();
    } catch (err: any) {
      setError(err?.message ?? t("plans.edit.error.titleUpdateFailed"));
    } finally {
      setSavingTitle(false);
    }
  };

  const handleAddAsset = async (assetId: string) => {
    if (!caseId || !planId) {
      setError(t("plans.edit.error.planIdMissing"));
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
      setError(err?.message ?? t("plans.edit.error.addAssetFailed"));
    } finally {
      setAddingAssetId(null);
    }
  };

  const handleRemoveAsset = async (planAssetId: string) => {
    if (!caseId || !planId) {
      setError(t("plans.edit.error.planIdMissing"));
      return;
    }
    setRemovingAssetId(planAssetId);
    setError(null);
    try {
      await deletePlanAsset(caseId, planId, planAssetId);
      await refreshAssets();
      await refreshPlan();
    } catch (err: any) {
      setError(err?.message ?? t("plans.edit.error.removeAssetFailed"));
    } finally {
      setRemovingAssetId(null);
    }
  };

  const handleAddHeir = async (heirUid: string) => {
    if (!caseId || !planId) {
      setError(t("plans.edit.error.planIdMissing"));
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
      setError(err?.message ?? t("plans.edit.error.addHeirFailed"));
    } finally {
      setAddingHeirUid(null);
    }
  };

  const handleRemoveHeir = async (heirUid: string) => {
    if (!caseId || !planId) {
      setError(t("plans.edit.error.planIdMissing"));
      return;
    }
    setRemovingHeirUid(heirUid);
    setError(null);
    try {
      await removePlanHeir(caseId, planId, heirUid);
      await refreshPlan();
      await refreshAssets();
    } catch (err: any) {
      setError(err?.message ?? t("plans.edit.error.removeHeirFailed"));
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
      setError(t("plans.edit.error.planIdMissing"));
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
      setError(err?.message ?? t("plans.edit.error.allocationUpdateFailed"));
    } finally {
      setSavingAllocationId(null);
    }
  };

  const canSaveTitle =
    Boolean(title.trim()) && title.trim() !== (plan?.title ?? "") && !savingTitle;

  const renderRelationLabel = (relationLabel?: string | null, relationOther?: string | null) => {
    if (!relationLabel) return t("plans.edit.heir.defaultLabel");
    if (relationLabel === relationOtherValue) return relationOther ?? t("plans.edit.heir.other");
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
            { label: t("nav.cases"), href: "/cases" },
            caseId
              ? { label: t("cases.detail.title"), href: `/cases/${caseId}` }
              : { label: t("cases.detail.title") },
            { label: t("plans.edit.title") }
          ]}
        />
        <div className={styles.headerRow}>
          <div className={styles.rowMain}>
            <h1 className="text-title">{plan?.title ?? t("plans.edit.title")}</h1>
            {plan ? (
              <div className={styles.rowSide}>
                <span className={styles.statusBadge}>
                  {statusLabels[plan.status] ?? plan.status}
                </span>
                <span className={styles.rowMeta}>
                  {t("plans.edit.updatedAt", { date: formatDate(plan.updatedAt) })}
                </span>
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
              {t("plans.edit.actions.backToDetail")}
            </Button>
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{t(error)}</FormAlert> : null}

      <div className={styles.callout}>
        <div className={styles.calloutIcon}>
          <span className={styles.badgeMuted}>STEP</span>
        </div>
        <div className={styles.calloutBody}>
          <div className={styles.calloutTitle}>{t("plans.edit.flow.title")}</div>
          <div className={styles.calloutText}>{t("plans.edit.flow.text")}</div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("plans.edit.section.basic")}</h2>
        <div className={styles.sectionBody}>
          <FormField label={t("plans.edit.form.title")}>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("plans.edit.form.titlePlaceholder")}
            />
          </FormField>
          <div className={styles.inlineRow}>
            <Button type="button" onClick={handleSaveTitle} disabled={!canSaveTitle}>
              {savingTitle ? t("plans.edit.form.saving") : t("plans.edit.form.saveTitle")}
            </Button>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("plans.edit.section.heirs")}</h2>
        <div className={styles.assetHeader}>
          <div className={styles.helper}>{t("plans.edit.heir.helper")}</div>
          <Dialog open={heirModalOpen} onOpenChange={setHeirModalOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm">
                {t("plans.edit.heir.add")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("plans.edit.heir.add")}</DialogTitle>
              </DialogHeader>
              {availableHeirs.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyTitle}>{t("plans.edit.heir.emptyAvailable.title")}</div>
                  <div className={styles.emptyBody}>
                    {t("plans.edit.heir.emptyAvailable.body")}
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
                          {addingHeirUid === heir.acceptedByUid
                            ? t("plans.edit.heir.adding")
                            : t("plans.edit.heir.addConfirm")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setHeirModalOpen(false)}>
                  {t("common.close")}
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
                    {removingHeirUid === heir.uid
                      ? t("plans.edit.heir.removing")
                      : t("plans.edit.heir.remove")}
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
            <div className={styles.emptyTitle}>{t("plans.edit.heir.emptySelected.title")}</div>
            <div className={styles.emptyBody}>{t("plans.edit.heir.emptySelected.body")}</div>
          </div>
        )}

      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("plans.edit.section.assets")}</h2>
        <div className={styles.assetHeader}>
          <div className={styles.helper}>{t("plans.edit.assets.helper")}</div>
          <Dialog open={assetModalOpen} onOpenChange={setAssetModalOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm">
                {t("plans.edit.assets.add")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("plans.edit.assets.add")}</DialogTitle>
              </DialogHeader>
              {availableAssets.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyTitle}>{t("plans.edit.assets.emptyAvailable.title")}</div>
                  <div className={styles.emptyBody}>
                    {t("plans.edit.assets.emptyAvailable.body")}
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
                          {addingAssetId === asset.assetId
                            ? t("plans.edit.assets.adding")
                            : t("plans.edit.assets.addConfirm")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAssetModalOpen(false)}>
                  {t("common.close")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? null : planAssets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>{t("plans.edit.assets.emptySelected.title")}</div>
            <div className={styles.emptyBody}>{t("plans.edit.assets.emptySelected.body")}</div>
          </div>
        ) : (
          <div className={styles.sectionBody}>
            {planAssets.map((asset) => (
              <div key={asset.planAssetId} className={styles.assetCard}>
                <div className={styles.assetHeader}>
                  <div className={styles.assetTitle}>
                    {asset.assetLabel || t("plans.edit.assets.unset")}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAsset(asset.planAssetId)}
                    disabled={removingAssetId === asset.planAssetId}
                  >
                    {removingAssetId === asset.planAssetId
                      ? t("plans.edit.assets.removing")
                      : t("plans.edit.assets.remove")}
                  </Button>
                </div>
                <div className={styles.rowMeta}>{asset.assetAddress ?? "-"}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("plans.edit.section.allocations")}</h2>
        {loading ? null : !plan ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>{t("plans.edit.allocations.emptyPlan.title")}</div>
            <div className={styles.emptyBody}>{t("plans.edit.allocations.emptyPlan.body")}</div>
          </div>
        ) : planAssets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>
              {t("plans.edit.allocations.emptyAssets.title")}
            </div>
            <div className={styles.emptyBody}>
              {t("plans.edit.allocations.emptyAssets.body")}
            </div>
          </div>
        ) : plan.heirs.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>
              {t("plans.edit.allocations.emptyHeirs.title")}
            </div>
            <div className={styles.emptyBody}>
              {t("plans.edit.allocations.emptyHeirs.body")}
            </div>
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
                      label: t("plans.edit.allocations.unallocated"),
                      value: unallocated,
                      percent: (unallocated / 100) * 100,
                      color: "#e2e8f0"
                    }
                  : null;
              const isSaving = savingAllocationId === asset.planAssetId;
              const unitLabel =
                unitType === "PERCENT"
                  ? t("plans.edit.allocations.unit.percent")
                  : t("plans.edit.allocations.unit.amount");
              return (
                <div key={asset.planAssetId} className={styles.assetCard}>
                  <div className={styles.assetHeader}>
                    <div>
                      <div className={styles.assetTitle}>
                        {asset.assetLabel || t("plans.edit.assets.unset")}
                      </div>
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
                        <option value="PERCENT">{t("plans.edit.allocations.unit.percent")}</option>
                        <option value="AMOUNT">{t("plans.edit.allocations.unit.amount")}</option>
                      </select>
                      <Button
                        type="button"
                        onClick={() => handleSaveAllocations(asset.planAssetId)}
                        disabled={isSaving}
                      >
                        {isSaving
                          ? t("plans.edit.allocations.saving")
                          : t("plans.edit.allocations.save")}
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
                        {t("plans.edit.allocations.totalPercent", {
                          total: Number(total.toFixed(6)),
                          unallocated
                        })}
                      </div>
                    ) : (
                      <div className={styles.rowMeta}>
                        {t("plans.edit.allocations.totalAmount", {
                          total: Number(total.toFixed(6))
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </section>
  );
}
