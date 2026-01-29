import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import { getPlan, listPlanAssets, type PlanAsset, type PlanDetail } from "../api/plans";
import { listCaseHeirs, type CaseHeir } from "../api/invites";
import styles from "../../styles/caseDetailPage.module.css";

const statusLabels: Record<string, string> = {
  DRAFT: "下書き",
  SHARED: "共有中",
  INACTIVE: "無効"
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "-";
  }
};

const formatAllocationValue = (value: number, unitType: "PERCENT" | "AMOUNT") => {
  if (!Number.isFinite(value)) return "-";
  return unitType === "PERCENT" ? `${value}%` : `${value}`;
};

export default function CasePlanDetailPage() {
  const { caseId, planId } = useParams();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [assets, setAssets] = useState<PlanAsset[]>([]);
  const [heirs, setHeirs] = useState<CaseHeir[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => plan?.title ?? "指図詳細", [plan]);

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
      } catch (err: any) {
        setError(err?.message ?? "指図の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [caseId, planId]);

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
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>概要</h2>
        </div>
        {loading ? null : plan ? (
          <div className={styles.list}>
            <div className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>共有日時</div>
                <div className={styles.rowMeta}>{formatDate(plan.sharedAt)}</div>
              </div>
            </div>
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

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>共有内容</h2>
        </div>
        {loading ? null : assets.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>共有された資産がありません</div>
            <div className={styles.emptyBody}>指図に含まれる資産がここに表示されます。</div>
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
                <div className={styles.rowSide}>{asset.unitType === "AMOUNT" ? "金額" : "割合"}</div>
              </div>
            ))}
          </div>
        )}
      </div>

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
    </section>
  );
}
