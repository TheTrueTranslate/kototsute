import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getRelationOptionKey, relationOtherValue } from "@kototsute/shared";
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
  updatePlanNftAllocations,
  updatePlanTitle,
  type PlanAsset,
  type PlanDetail
} from "../api/plans";
import styles from "../../styles/plansPage.module.css";

type AllocationDraft = {
  values: Record<string, string>;
};

type AllocationUpdateInput = {
  unitType: "PERCENT";
  allocations: Array<{ heirUid: string; value: number }>;
};

const roundAllocationValue = (value: number) => Number(value.toFixed(6));
const relationOtherKey = getRelationOptionKey(relationOtherValue);

export const parseAllocationValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const buildAllocationUpdateInput = (
  heirUids: string[],
  draftValues: Record<string, string>
): AllocationUpdateInput => ({
  unitType: "PERCENT",
  allocations: heirUids.map((heirUid) => ({
    heirUid,
    value: roundAllocationValue(parseAllocationValue(draftValues[heirUid] ?? ""))
  }))
});

export const buildAllocationSignature = (input: AllocationUpdateInput) =>
  JSON.stringify(
    input.allocations.map((allocation) => ({
      heirUid: allocation.heirUid,
      value: roundAllocationValue(allocation.value)
    }))
  );

export const localizePlanRelationLabel = (
  relationLabel: string | null | undefined,
  relationOther: string | null | undefined,
  t: (key: string) => string
) => {
  if (!relationLabel) return null;
  const relationKey = getRelationOptionKey(relationLabel);
  if (relationKey === relationOtherKey) {
    return relationOther?.trim() ? relationOther : t("plans.edit.heir.other");
  }
  return relationKey ? t(relationKey) : relationLabel;
};

const buildAllocationDraftValues = (
  heirUids: string[],
  allocations: PlanAsset["allocations"] | undefined
) => {
  const valueMap = new Map<string, number>();
  for (const allocation of allocations ?? []) {
    if (!allocation.heirUid || allocation.isUnallocated) continue;
    if (!valueMap.has(allocation.heirUid)) {
      valueMap.set(allocation.heirUid, allocation.value);
    }
  }
  const values: Record<string, string> = {};
  for (const heirUid of heirUids) {
    const value = valueMap.get(heirUid);
    values[heirUid] = value == null ? "" : String(value);
  }
  return values;
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
  const [nftDrafts, setNftDrafts] = useState<Record<string, Record<string, string>>>({});
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [addingAssetId, setAddingAssetId] = useState<string | null>(null);
  const [removingAssetId, setRemovingAssetId] = useState<string | null>(null);
  const [addingHeirUid, setAddingHeirUid] = useState<string | null>(null);
  const [removingHeirUid, setRemovingHeirUid] = useState<string | null>(null);
  const [savingAllocationIds, setSavingAllocationIds] = useState<Record<string, boolean>>({});
  const [savingNftAssetId, setSavingNftAssetId] = useState<string | null>(null);
  const [heirModalOpen, setHeirModalOpen] = useState(false);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const savedAllocationSignaturesRef = useRef<Record<string, string>>({});
  const queuedAllocationSignaturesRef = useRef<Record<string, string>>({});
  const failedAllocationSignaturesRef = useRef<Record<string, string>>({});

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

  const nftAssets = useMemo(
    () => planAssets.filter((asset) => (asset.nfts ?? []).length > 0),
    [planAssets]
  );

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
    const heirUids = plan.heirs.map((heir) => heir.uid);
    const nextDrafts: Record<string, AllocationDraft> = {};
    planAssets.forEach((asset) => {
      const values = buildAllocationDraftValues(heirUids, asset.allocations);
      nextDrafts[asset.planAssetId] = {
        values
      };
    });
    setAllocationDrafts(nextDrafts);
  }, [plan, planAssets]);

  useEffect(() => {
    const nextDrafts: Record<string, Record<string, string>> = {};
    planAssets.forEach((asset) => {
      const values: Record<string, string> = {};
      const allocations = Array.isArray(asset.nftAllocations) ? asset.nftAllocations : [];
      (asset.nfts ?? []).forEach((nft) => {
        const allocation = allocations.find((item) => item.tokenId === nft.tokenId);
        values[nft.tokenId] = allocation?.heirUid ?? "";
      });
      nextDrafts[asset.planAssetId] = values;
    });
    setNftDrafts(nextDrafts);
  }, [planAssets]);

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
      const current = prev[planAssetId] ?? { values: {} };
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

  const persistAllocationDraft = async (
    planAssetId: string,
    input: AllocationUpdateInput,
    signature: string
  ) => {
    if (!caseId || !planId) {
      setError(t("plans.edit.error.planIdMissing"));
      return;
    }
    setSavingAllocationIds((prev) => ({ ...prev, [planAssetId]: true }));
    setError(null);
    try {
      await updatePlanAllocations(caseId, planId, planAssetId, input);
      savedAllocationSignaturesRef.current[planAssetId] = signature;
      delete failedAllocationSignaturesRef.current[planAssetId];
    } catch (err: any) {
      setError(err?.message ?? t("plans.edit.error.allocationUpdateFailed"));
      failedAllocationSignaturesRef.current[planAssetId] = signature;
    } finally {
      setSavingAllocationIds((prev) => {
        const next = { ...prev };
        delete next[planAssetId];
        return next;
      });
      delete queuedAllocationSignaturesRef.current[planAssetId];
    }
  };

  const handleNftAllocationChange = (planAssetId: string, tokenId: string, value: string) => {
    setNftDrafts((prev) => ({
      ...prev,
      [planAssetId]: {
        ...(prev[planAssetId] ?? {}),
        [tokenId]: value
      }
    }));
  };

  const handleSaveNftAllocations = async (asset: PlanAsset) => {
    if (!caseId || !planId) {
      setError(t("plans.edit.error.planIdMissing"));
      return;
    }
    setSavingNftAssetId(asset.planAssetId);
    setError(null);
    try {
      const draft = nftDrafts[asset.planAssetId] ?? {};
      const allocations = (asset.nfts ?? []).map((nft) => ({
        tokenId: nft.tokenId,
        heirUid: draft[nft.tokenId] ? draft[nft.tokenId] : null
      }));
      await updatePlanNftAllocations(caseId, planId, asset.planAssetId, { allocations });
      await refreshAssets();
    } catch (err: any) {
      setError(err?.message ?? t("plans.edit.error.nftAllocationFailed"));
    } finally {
      setSavingNftAssetId(null);
    }
  };

  const canSaveTitle =
    Boolean(title.trim()) && title.trim() !== (plan?.title ?? "") && !savingTitle;

  const renderRelationLabel = (relationLabel?: string | null, relationOther?: string | null) => {
    if (!relationLabel) return t("plans.edit.heir.defaultLabel");
    return (
      localizePlanRelationLabel(relationLabel, relationOther, t) ??
      t("plans.edit.heir.defaultLabel")
    );
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

  useEffect(() => {
    if (!plan) {
      savedAllocationSignaturesRef.current = {};
      queuedAllocationSignaturesRef.current = {};
      failedAllocationSignaturesRef.current = {};
      return;
    }

    const heirUids = plan.heirs.map((heir) => heir.uid);
    const nextSavedSignatures: Record<string, string> = {};
    planAssets.forEach((asset) => {
      nextSavedSignatures[asset.planAssetId] = buildAllocationSignature(
        buildAllocationUpdateInput(
          heirUids,
          buildAllocationDraftValues(heirUids, asset.allocations)
        )
      );
    });
    savedAllocationSignaturesRef.current = nextSavedSignatures;
    queuedAllocationSignaturesRef.current = {};
    failedAllocationSignaturesRef.current = {};
  }, [plan, planAssets]);

  useEffect(() => {
    if (!plan || !caseId || !planId) return;
    const heirUids = plan.heirs.map((heir) => heir.uid);
    planAssets.forEach((asset) => {
      const planAssetId = asset.planAssetId;
      const input = buildAllocationUpdateInput(
        heirUids,
        allocationDrafts[planAssetId]?.values ?? {}
      );
      const signature = buildAllocationSignature(input);
      const savedSignature = savedAllocationSignaturesRef.current[planAssetId];
      if (savedSignature === signature) {
        delete queuedAllocationSignaturesRef.current[planAssetId];
        return;
      }
      if (failedAllocationSignaturesRef.current[planAssetId] === signature) {
        return;
      }
      if (savingAllocationIds[planAssetId]) {
        queuedAllocationSignaturesRef.current[planAssetId] = signature;
        return;
      }
      if (queuedAllocationSignaturesRef.current[planAssetId] === signature) {
        return;
      }
      queuedAllocationSignaturesRef.current[planAssetId] = signature;
      void persistAllocationDraft(planAssetId, input, signature);
    });
  }, [allocationDrafts, caseId, plan, planAssets, planId, savingAllocationIds]);

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
              const values = plan.heirs.map((heir) =>
                parseAllocationValue(draft?.values?.[heir.uid] ?? "")
              );
              const total = values.reduce((sum, value) => sum + value, 0);
              const unallocated = Math.max(0, Number((100 - total).toFixed(6)));
              const totalForBar = 100;
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
                unallocated > 0
                  ? {
                      key: "unallocated",
                      label: t("plans.edit.allocations.unallocated"),
                      value: unallocated,
                      percent: (unallocated / 100) * 100,
                      color: "#e2e8f0"
                    }
                  : null;
              const isSaving = Boolean(savingAllocationIds[asset.planAssetId]);
              const unitLabel = "%";
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
                      <span className={styles.rowMeta}>
                        {isSaving
                          ? t("plans.edit.allocations.autoSaving")
                          : t("plans.edit.allocations.autoSave")}
                      </span>
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
                          step="0.01"
                          value={draft?.values?.[heir.uid] ?? ""}
                          onChange={(event) =>
                            handleAllocationChange(asset.planAssetId, heir.uid, event.target.value)
                          }
                        />
                        <span className={styles.unitSuffix}>{unitLabel}</span>
                      </div>
                    ))}
                    <div className={styles.rowMeta}>
                      {t("plans.edit.allocations.totalPercent", {
                        total: Number(total.toFixed(6)),
                        unallocated
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("plans.edit.nft.title")}</h2>
        {loading ? null : !plan || nftAssets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>{t("plans.edit.nft.empty")}</div>
          </div>
        ) : (
          <div className={styles.sectionBody}>
            {nftAssets.map((asset) => {
              const draft = nftDrafts[asset.planAssetId] ?? {};
              const isSaving = savingNftAssetId === asset.planAssetId;
              return (
                <div key={asset.planAssetId} className={styles.assetCard}>
                  <div className={styles.assetHeader}>
                    <div>
                      <div className={styles.assetTitle}>
                        {asset.assetLabel || t("plans.edit.assets.unset")}
                      </div>
                      <div className={styles.rowMeta}>{asset.assetAddress ?? "-"}</div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => handleSaveNftAllocations(asset)}
                      disabled={isSaving}
                    >
                      {isSaving ? t("plans.edit.nft.saving") : t("plans.edit.nft.save")}
                    </Button>
                  </div>
                  <div className={styles.sectionBody}>
                    {(asset.nfts ?? []).map((nft) => (
                      <div key={nft.tokenId} className={styles.nftRow}>
                        <div className={styles.nftMeta}>
                          <div className={styles.nftToken}>{nft.tokenId}</div>
                          {nft.uri ? <div className={styles.rowMeta}>{nft.uri}</div> : null}
                        </div>
                        <select
                          className={styles.select}
                          value={draft[nft.tokenId] ?? ""}
                          onChange={(event) =>
                            handleNftAllocationChange(
                              asset.planAssetId,
                              nft.tokenId,
                              event.target.value
                            )
                          }
                          disabled={isSaving}
                        >
                          <option value="">{t("plans.edit.nft.unassigned")}</option>
                          {plan.heirs.map((heir) => (
                            <option key={heir.uid} value={heir.uid}>
                              {heir.email}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
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
