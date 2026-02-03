import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import Tabs from "../../features/shared/components/tabs";
import { Button } from "../../features/shared/components/ui/button";
import { Input } from "../../features/shared/components/ui/input";
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
  confirmVerify,
  deleteAsset,
  getAsset,
  getAssetHistory,
  requestVerifyChallenge,
  updateAssetReserve,
  type AssetDetail,
  type AssetHistoryItem,
  type AssetReserveToken
} from "../api/assets";
import { getCase, type CaseSummary } from "../api/cases";
import { WalletVerifyPanel } from "../../features/shared/components/wallet-verify-panel";
import { autoVerifyWalletOwnership } from "../../features/shared/lib/wallet-verify";
import {
  createPaymentTx,
  signSingle,
  submitSignedBlob
} from "../../features/xrpl/xrpl-client";
import { normalizeNumberInput } from "../../features/shared/lib/xrp-amount";
import styles from "../../styles/assetDetailPage.module.css";

type TabKey = "overview" | "history";

const toNumber = (value: string | number | null | undefined) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatAmount = (value: number) => {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(6).replace(/\.?0+$/, "");
};

type RelatedPlan = {
  planId: string;
  title: string | null;
};

type AssetDetailPageProps = {
  initialAsset?: AssetDetail;
  initialHistoryItems?: AssetHistoryItem[];
  initialTab?: TabKey;
  initialCaseData?: CaseSummary | null;
};

export default function AssetDetailPage({
  initialAsset,
  initialHistoryItems,
  initialTab,
  initialCaseData = null
}: AssetDetailPageProps = {}) {
  const { caseId, assetId } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [asset, setAsset] = useState<AssetDetail | null>(initialAsset ?? null);
  const [loading, setLoading] = useState(!initialAsset);
  const [error, setError] = useState<string | null>(null);
  const [caseData, setCaseData] = useState<CaseSummary | null>(initialCaseData);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<TabKey>(initialTab ?? "overview");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState<string | null>(null);
  const [verifySecret, setVerifySecret] = useState("");
  const [verifySending, setVerifySending] = useState(false);
  const [verifyChallengeLoading, setVerifyChallengeLoading] = useState(false);
  const [challenge, setChallenge] = useState<
    | {
        challenge: string;
        address: string;
        amountDrops: string;
      }
    | null
  >(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [relatedPlans, setRelatedPlans] = useState<RelatedPlan[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [historyItems, setHistoryItems] = useState<AssetHistoryItem[]>(
    initialHistoryItems ?? []
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [reserveXrpInput, setReserveXrpInput] = useState("0");
  const [reserveTokens, setReserveTokens] = useState<AssetReserveToken[]>([]);
  const [reserveSaving, setReserveSaving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);
  const [reserveSuccess, setReserveSuccess] = useState<string | null>(null);

  const verificationLabels: Record<AssetDetail["verificationStatus"], string> = {
    UNVERIFIED: t("assets.detail.status.unverified"),
    PENDING: t("assets.detail.status.pending"),
    VERIFIED: t("assets.detail.status.verified")
  };

  const tabItems = [
    { key: "overview", label: t("assets.detail.tabs.overview") },
    { key: "history", label: t("assets.detail.tabs.history") }
  ];

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    try {
      return new Date(value).toLocaleString(i18n.language);
    } catch {
      return "-";
    }
  };

  const historyTypeLabels: Record<string, string> = {
    ASSET_CREATED: t("assets.detail.history.types.created"),
    ASSET_DELETED: t("assets.detail.history.types.deleted"),
    ASSET_RESERVE_UPDATED: t("assets.detail.history.types.reserve"),
    ASSET_VERIFY_REQUESTED: t("assets.detail.history.types.verifyRequested"),
    ASSET_VERIFY_CONFIRMED: t("assets.detail.history.types.verifyConfirmed"),
    ASSET_SYNCED: t("assets.detail.history.types.synced"),
    SYNC_LOG: t("assets.detail.history.types.syncLog")
  };

  const title = useMemo(() => asset?.label ?? t("assets.detail.title"), [asset?.label, t]);
  const isLocked = caseData?.assetLockStatus === "LOCKED";
  const memoValue = asset?.verificationChallenge ?? challenge?.challenge ?? "";
  const memoDisplay =
    memoValue ||
    (verifyChallengeLoading
      ? t("assets.detail.verify.memoIssuing")
      : t("assets.detail.verify.memoEmpty"));

  useEffect(() => {
    if (!caseId || initialCaseData) return;
    getCase(caseId)
      .then((data) => setCaseData(data))
      .catch(() => setCaseData(null));
  }, [caseId, initialCaseData]);
  const availableTokens = useMemo(() => {
    if (asset?.xrpl?.status === "ok") {
      return asset.xrpl.tokens ?? [];
    }
    return [];
  }, [asset?.xrpl]);
  const reserveTokenMap = useMemo(() => {
    return new Map(
      reserveTokens.map((token) => [`${token.currency}::${token.issuer ?? ""}`, token])
    );
  }, [reserveTokens]);
  const inheritanceXrp = useMemo(() => {
    if (asset?.xrpl?.status !== "ok") return null;
    const balance = toNumber(asset.xrpl.balanceXrp);
    const reserve = toNumber(reserveXrpInput);
    return Math.max(balance - reserve, 0);
  }, [asset?.xrpl, reserveXrpInput]);
  const inheritanceTokens = useMemo(() => {
    if (asset?.xrpl?.status !== "ok") return [];
    const tokens = asset.xrpl.tokens ?? [];
    return tokens.map((token) => {
      const key = `${token.currency}::${token.issuer ?? ""}`;
      const reserve = toNumber(reserveTokenMap.get(key)?.reserveAmount);
      const balance = toNumber(token.balance);
      return {
        currency: token.currency,
        issuer: token.issuer ?? null,
        balance,
        reserve,
        planned: Math.max(balance - reserve, 0)
      };
    });
  }, [asset?.xrpl, reserveTokenMap]);

  useEffect(() => {
    if (!asset) return;
    setReserveXrpInput(asset.reserveXrp ?? "0");
    setReserveTokens(Array.isArray(asset.reserveTokens) ? asset.reserveTokens : []);
  }, [asset?.assetId]);

  const loadAsset = async (options?: { includeXrpl?: boolean }) => {
    if (!caseId || !assetId) return;
    const detail = await getAsset(caseId, assetId, {
      includeXrpl: Boolean(options?.includeXrpl)
    });
    setAsset(detail);
  };

  const loadHistory = async () => {
    if (!caseId || !assetId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await getAssetHistory(caseId, assetId);
      setHistoryItems(data);
    } catch (err: any) {
      setHistoryError(err?.message ?? "assets.detail.error.historyFailed");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      if (!caseId || !assetId) {
        setError("assets.detail.error.assetIdMissing");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await loadAsset();
      } catch (err: any) {
        setError(err?.message ?? "assets.detail.error.fetchFailed");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [caseId, assetId]);

  useEffect(() => {
    if (tab !== "history") return;
    loadHistory();
  }, [tab, caseId, assetId]);

  useEffect(() => {
    if (!verifyOpen) return;
    if (!caseId || !assetId) return;
    if (asset?.verificationChallenge || challenge || verifyChallengeLoading) return;
    handleRequestChallenge();
  }, [
    verifyOpen,
    caseId,
    assetId,
    asset?.verificationChallenge,
    challenge,
    verifyChallengeLoading
  ]);

  const handleSync = async () => {
    if (!caseId || !assetId) return;
    setSyncing(true);
    try {
      await loadAsset({ includeXrpl: true });
      if (tab === "history") {
        await loadHistory();
      }
    } catch (err: any) {
      setError(err?.message ?? "assets.detail.error.xrplFailed");
    } finally {
      setSyncing(false);
    }
  };

  const handleRequestChallenge = async () => {
    if (!caseId || !assetId) return;
    setVerifyError(null);
    setVerifySuccess(null);
    setVerifyChallengeLoading(true);
    try {
      const result = await requestVerifyChallenge(caseId, assetId);
      setChallenge(result);
      setAsset((prev) =>
        prev
          ? {
              ...prev,
              verificationStatus: "PENDING",
              verificationChallenge: result.challenge,
              verificationAddress: result.address
            }
          : prev
      );
    } catch (err: any) {
      setVerifyError(err?.message ?? "assets.detail.verify.challengeError");
    } finally {
      setVerifyChallengeLoading(false);
    }
  };

  const getReserveTokenKey = (token: { currency: string; issuer: string | null }) =>
    `${token.currency}::${token.issuer ?? ""}`;

  const isReserveTokenSelected = (token: { currency: string; issuer: string | null }) =>
    reserveTokens.some(
      (item) => item.currency === token.currency && item.issuer === token.issuer
    );

  const handleToggleReserveToken = (token: { currency: string; issuer: string | null }) => {
    const key = getReserveTokenKey(token);
    if (isReserveTokenSelected(token)) {
      setReserveTokens((prev) =>
        prev.filter((item) => getReserveTokenKey(item) !== key)
      );
      return;
    }
    setReserveTokens((prev) => [
      ...prev,
      { currency: token.currency, issuer: token.issuer, reserveAmount: "0" }
    ]);
  };

  const handleReserveTokenAmountChange = (
    token: { currency: string; issuer: string | null },
    value: string
  ) => {
    const cleaned = normalizeNumberInput(value);
    setReserveTokens((prev) =>
      prev.map((item) =>
        item.currency === token.currency && item.issuer === token.issuer
          ? { ...item, reserveAmount: cleaned }
          : item
      )
    );
  };

  const handleSaveReserve = async () => {
    if (!caseId || !assetId) return;
    setReserveError(null);
    setReserveSuccess(null);
    setReserveSaving(true);
    const normalizedXrp = reserveXrpInput.trim() === "" ? "0" : reserveXrpInput;
    try {
      await updateAssetReserve(caseId, assetId, {
        reserveXrp: normalizedXrp,
        reserveTokens
      });
      setReserveSuccess("assets.detail.reserve.success");
      setAsset((prev) =>
        prev
          ? {
              ...prev,
              reserveXrp: normalizedXrp,
              reserveTokens
            }
          : prev
      );
      if (tab === "history") {
        await loadHistory();
      }
    } catch (err: any) {
      setReserveError(err?.message ?? "assets.detail.reserve.error");
    } finally {
      setReserveSaving(false);
    }
  };

  const resolveVerifyChallenge = () => {
    if (challenge) return challenge;
    if (asset?.verificationChallenge) {
      return {
        challenge: asset.verificationChallenge,
        address: asset.verificationAddress,
        amountDrops: "1"
      };
    }
    return null;
  };

  const handleAutoVerify = async () => {
    if (!caseId || !assetId || !asset) return;
    setVerifyError(null);
    setVerifySuccess(null);
    setVerifySending(true);
    try {
      const result = await autoVerifyWalletOwnership(
        {
          walletAddress: asset.address,
          secret: verifySecret,
          challenge: resolveVerifyChallenge()
        },
        {
          requestChallenge: () => requestVerifyChallenge(caseId, assetId),
          createPaymentTx,
          signSingle,
          submitSignedBlob,
          confirmVerify: (txHash) => confirmVerify(caseId, assetId, txHash)
        }
      );
      setChallenge(result.challenge);
      setVerifySecret("");
      setVerifySuccess("assets.detail.verify.success");
      await loadAsset();
      if (tab === "history") {
        await loadHistory();
      }
    } catch (err: any) {
      setVerifyError(err?.message ?? "assets.detail.verify.error");
    } finally {
      setVerifySending(false);
    }
  };

  const handleDelete = async () => {
    if (!caseId || !assetId) return;
    setDeleteError(null);
    setRelatedPlans([]);
    setDeleting(true);
    try {
      await deleteAsset(caseId, assetId);
      navigate(`/cases/${caseId}`);
    } catch (err: any) {
      const apiData = err?.data;
      if (err?.status === 409 && apiData?.data?.relatedPlans) {
        setRelatedPlans(apiData.data.relatedPlans as RelatedPlan[]);
        setDeleteError(apiData?.message ?? "assets.detail.delete.relatedError");
      } else {
        setDeleteError(err?.message ?? "assets.detail.delete.error");
      }
    } finally {
      setDeleting(false);
    }
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
            { label: t("assets.detail.breadcrumb") }
          ]}
        />
        <div className={styles.headerRow}>
          <div className={styles.headerMain}>
            <h1 className="text-title">{title}</h1>
            {asset ? <div className={styles.address}>{asset.address}</div> : null}
          </div>
          <div className={styles.headerActions}>
            <Button size="sm" variant="ghost" onClick={handleSync} disabled={syncing || isLocked}>
              <RefreshCw />
              {syncing ? t("assets.detail.actions.syncing") : t("assets.detail.actions.sync")}
            </Button>
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{t(error)}</FormAlert> : null}

      {loading ? null : asset ? (
        <>
          <Tabs
            items={tabItems}
            value={tab}
            onChange={(value) => setTab(value as TabKey)}
            className={styles.tabs}
          />

          {tab === "overview" ? (
            <div className={styles.contentGrid}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>{t("assets.detail.overview.title")}</h2>
                </div>
                <div className={styles.metaGrid}>
                  <div>
                    <div className={styles.metaLabel}>{t("assets.detail.overview.createdAt")}</div>
                    <div className={styles.metaValue}>{formatDate(asset.createdAt)}</div>
                  </div>
                  <div>
                    <div className={styles.metaLabel}>{t("assets.detail.overview.updatedAt")}</div>
                    <div className={styles.metaValue}>{formatDate(asset.updatedAt)}</div>
                  </div>
                  <div>
                    <div className={styles.metaLabel}>{t("assets.detail.overview.status")}</div>
                    <div className={styles.metaValue}>
                      <div className={styles.statusRow}>
                        <span className={styles.statusBadge}>
                          {verificationLabels[asset.verificationStatus]}
                        </span>
                        {asset.verificationStatus !== "VERIFIED" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setVerifyOpen(true)}
                            disabled={isLocked}
                          >
                            {t("assets.detail.actions.verifyOwnership")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>{t("assets.detail.wallet.title")}</h2>
                  <span className={styles.metaHint}>
                    {t("assets.detail.wallet.lastSynced", {
                      date: formatDate(asset.xrpl?.syncedAt)
                    })}
                  </span>
                </div>
                {asset.xrpl ? (
                  asset.xrpl.status === "ok" ? (
                    <div className={styles.xrplGrid}>
                      <div>
                        <div className={styles.metaLabel}>{t("assets.detail.wallet.balance")}</div>
                        <div className={styles.metaValue}>{asset.xrpl.balanceXrp}</div>
                      </div>
                      <div>
                        <div className={styles.metaLabel}>{t("assets.detail.wallet.ledger")}</div>
                        <div className={styles.metaValue}>{asset.xrpl.ledgerIndex ?? "-"}</div>
                      </div>
                      {asset.xrpl.tokens?.length ? (
                        <div className={styles.tokenList}>
                          {asset.xrpl.tokens.map((token) => (
                            <div
                              key={`${token.currency}-${token.issuer ?? ""}`}
                              className={styles.tokenRow}
                            >
                              <div className={styles.tokenInfo}>
                                <div className={styles.tokenName}>{token.currency}</div>
                                <div className={styles.tokenIssuer}>
                                  {token.issuer ?? t("assets.detail.token.native")}
                                </div>
                              </div>
                              <div className={styles.tokenBalance}>
                                <span className={styles.tokenBalanceLabel}>
                                  {t("assets.detail.wallet.tokenBalance")}
                                </span>
                                <span>{formatAmount(toNumber(token.balance))}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.emptyText}>
                          {t("assets.detail.wallet.emptyTokens")}
                        </div>
                      )}
                    </div>
                  ) : (
                    <FormAlert variant="error">{asset.xrpl.message}</FormAlert>
                  )
                ) : (
                  <div className={styles.emptyText}>{t("assets.detail.wallet.empty")}</div>
                )}
              </div>

              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>{t("assets.detail.reserve.title")}</h2>
                  <span className={styles.metaHint}>
                    {t("assets.detail.reserve.hint")}
                  </span>
                </div>
                <div className={styles.combinedGrid}>
                  <div className={styles.combinedSection}>
                    <h3 className={styles.sectionTitle}>
                      {t("assets.detail.reserve.inheritanceTitle")}
                    </h3>
                    {asset.xrpl ? (
                      asset.xrpl.status === "ok" ? (
                        <div className={styles.inheritanceGrid}>
                          <div className={styles.inheritanceBlock}>
                            <div className={styles.metaLabel}>XRP</div>
                            <div className={styles.inheritanceValue}>
                              {inheritanceXrp === null
                                ? "-"
                                : `${formatAmount(inheritanceXrp)} XRP`}
                            </div>
                            <div className={styles.inheritanceMeta}>
                              {t("assets.detail.reserve.balanceMeta", {
                                balance: asset.xrpl.balanceXrp,
                                reserve: reserveXrpInput
                              })}
                            </div>
                          </div>
                          <div className={styles.inheritanceTokenBlock}>
                            <div className={styles.metaLabel}>
                              {t("assets.detail.reserve.tokensLabel")}
                            </div>
                            {inheritanceTokens.length === 0 ? (
                              <div className={styles.emptyText}>
                                {t("assets.detail.wallet.emptyTokens")}
                              </div>
                            ) : (
                              <div className={styles.tokenList}>
                                {inheritanceTokens.map((token) => (
                                  <div
                                    key={`${token.currency}-${token.issuer ?? ""}`}
                                    className={styles.tokenRow}
                                  >
                                    <div className={styles.tokenInfo}>
                                      <div className={styles.tokenName}>{token.currency}</div>
                                      <div className={styles.tokenIssuer}>
                                        {token.issuer ?? t("assets.detail.token.native")}
                                      </div>
                                      <div className={styles.tokenMeta}>
                                        {t("assets.detail.reserve.tokenMeta", {
                                          balance: formatAmount(token.balance),
                                          reserve: formatAmount(token.reserve)
                                        })}
                                      </div>
                                    </div>
                                    <div className={styles.tokenBalance}>
                                      <span className={styles.tokenBalanceLabel}>
                                        {t("assets.detail.reserve.plannedLabel")}
                                      </span>
                                      <span>{formatAmount(token.planned)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <FormAlert variant="error">{asset.xrpl.message}</FormAlert>
                      )
                    ) : (
                      <div className={styles.emptyText}>
                        {t("assets.detail.reserve.syncHint")}
                      </div>
                    )}
                  </div>
                  <div className={`${styles.combinedSection} ${styles.combinedSectionAlt}`}>
                    <h3 className={styles.sectionTitle}>
                      {t("assets.detail.reserve.settingsTitle")}
                    </h3>
                    {reserveError ? (
                      <FormAlert variant="error">{t(reserveError)}</FormAlert>
                    ) : null}
                    {reserveSuccess ? (
                      <FormAlert variant="success">{t(reserveSuccess)}</FormAlert>
                    ) : null}
                    <div className={styles.reserveGrid}>
                      <FormField label={t("assets.detail.reserve.xrpLabel")}>
                        <Input
                          value={reserveXrpInput}
                          onChange={(event) =>
                            setReserveXrpInput(normalizeNumberInput(event.target.value))
                          }
                          placeholder="0"
                          disabled={isLocked}
                        />
                      </FormField>
                      <div className={styles.reserveTokenBlock}>
                        <div className={styles.metaLabel}>
                          {t("assets.detail.reserve.tokenLabel")}
                        </div>
                        {availableTokens.length === 0 ? (
                          <div className={styles.emptyText}>
                            {t("assets.detail.reserve.tokenHint")}
                          </div>
                        ) : (
                          <div className={styles.reserveTokenList}>
                            {availableTokens.map((token) => {
                              const key = getReserveTokenKey(token);
                              const selected = isReserveTokenSelected(token);
                              const selectedToken = reserveTokens.find(
                                (item) =>
                                  item.currency === token.currency && item.issuer === token.issuer
                              );
                              return (
                                <div key={key} className={styles.reserveTokenRow}>
                                  <label className={styles.reserveTokenLabel}>
                                    <input
                                      type="checkbox"
                                      className={styles.reserveTokenCheckbox}
                                      checked={selected}
                                      onChange={() => handleToggleReserveToken(token)}
                                      disabled={isLocked}
                                    />
                                    <span className={styles.reserveTokenName}>
                                      {token.currency}
                                    </span>
                                    <span className={styles.reserveTokenIssuer}>
                                      {token.issuer ?? t("assets.detail.token.native")}
                                    </span>
                                  </label>
                                  {selected ? (
                                    <Input
                                      value={selectedToken?.reserveAmount ?? "0"}
                                      onChange={(event) =>
                                        handleReserveTokenAmountChange(token, event.target.value)
                                      }
                                      className={styles.reserveTokenInput}
                                      placeholder="0"
                                      disabled={isLocked}
                                    />
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className={styles.reserveActions}>
                        <Button
                          size="sm"
                          onClick={handleSaveReserve}
                          disabled={reserveSaving || isLocked}
                        >
                          {reserveSaving
                            ? t("assets.detail.reserve.saving")
                            : t("assets.detail.reserve.save")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("assets.detail.verify.title")}</DialogTitle>
                    <DialogDescription>
                      {t("assets.detail.verify.description")}
                    </DialogDescription>
                  </DialogHeader>
                  {verifyError ? (
                    <FormAlert variant="error">{t(verifyError)}</FormAlert>
                  ) : null}
                  {verifySuccess ? (
                    <FormAlert variant="success">{t(verifySuccess)}</FormAlert>
                  ) : null}

                  <WalletVerifyPanel
                    destination={asset.verificationAddress}
                    memo={memoDisplay}
                    secret={verifySecret}
                    onSecretChange={setVerifySecret}
                    onSubmit={handleAutoVerify}
                    isSubmitting={verifySending}
                    submitDisabled={isLocked || verifySending || verifyChallengeLoading}
                    secretDisabled={isLocked || verifySending}
                  />
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="ghost">{t("common.close")}</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : null}

          {tab === "history" ? (
            <div className={styles.contentGrid}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>{t("assets.detail.history.title")}</h2>
                  <span className={styles.metaHint}>{t("assets.detail.history.hint")}</span>
                </div>
                {historyError ? (
                  <FormAlert variant="error">{t(historyError)}</FormAlert>
                ) : null}
                {historyLoading ? (
                  <div className={styles.emptyText}>{t("common.loading")}</div>
                ) : historyItems.length === 0 ? (
                  <div className={styles.emptyText}>{t("assets.detail.history.empty")}</div>
                ) : (
                  <div className={styles.logList}>
                    {historyItems.map((item) => {
                      const label = historyTypeLabels[item.type] ?? item.type;
                      const status =
                        item.meta && typeof item.meta.status === "string"
                          ? item.meta.status
                          : null;
                      const actorLabel = item.actorEmail ?? item.actorUid;
                      const badgeClass =
                        status === "ok"
                          ? styles.logBadgeSuccess
                          : status === "error"
                            ? styles.logBadgeError
                            : "";
                      return (
                        <div key={item.historyId} className={styles.logRow}>
                          <div className={styles.logMain}>
                            <div className={styles.logHeader}>
                              <span
                                className={
                                  badgeClass
                                    ? `${styles.logBadge} ${badgeClass}`
                                    : styles.logBadge
                                }
                              >
                                {label}
                              </span>
                              <div className={styles.logSummary}>{item.title}</div>
                            </div>
                            <div className={styles.logMessage}>
                              {item.detail ?? t("assets.detail.history.emptyDetail")}
                            </div>
                            {actorLabel ? (
                              <div className={styles.logActor}>
                                {t("assets.detail.history.actor", { name: actorLabel })}
                              </div>
                            ) : null}
                          </div>
                          <div className={styles.logMeta}>{formatDate(item.createdAt)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <div className={styles.footerActions}>
        {!isLocked ? (
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">{t("assets.detail.actions.delete")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("assets.detail.delete.title")}</DialogTitle>
                <DialogDescription>{t("assets.detail.delete.description")}</DialogDescription>
              </DialogHeader>
              {deleteError ? <FormAlert variant="error">{t(deleteError)}</FormAlert> : null}
              {relatedPlans.length > 0 ? (
                <div className={styles.relatedList}>
                  {relatedPlans.map((plan) => (
                    <Link
                      key={plan.planId}
                      to={`/cases/${caseId}/plans/${plan.planId}/edit`}
                      className={styles.relatedLink}
                    >
                      {plan.title ?? t("plans.detail.breadcrumb")}
                    </Link>
                  ))}
                </div>
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">{t("common.cancel")}</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting || relatedPlans.length > 0}
                >
                  {deleting
                    ? t("assets.detail.actions.deleting")
                    : t("assets.detail.actions.confirmDelete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </section>
  );
}
