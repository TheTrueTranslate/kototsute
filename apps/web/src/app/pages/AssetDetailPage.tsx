import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Copy, RefreshCw } from "lucide-react";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
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
  requestVerifyChallenge,
  type AssetDetail
} from "../api/assets";
import styles from "../../styles/assetDetailPage.module.css";

const verificationLabels: Record<AssetDetail["verificationStatus"], string> = {
  UNVERIFIED: "未検証",
  PENDING: "検証中",
  VERIFIED: "検証済み"
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
};

type RelatedPlan = {
  planId: string;
  title: string | null;
};

type AssetDetailPageProps = {
  initialAsset?: AssetDetail;
};

export default function AssetDetailPage({ initialAsset }: AssetDetailPageProps = {}) {
  const { caseId, assetId } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<AssetDetail | null>(initialAsset ?? null);
  const [loading, setLoading] = useState(!initialAsset);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState<string | null>(null);
  const [txHash, setTxHash] = useState("");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<
    | {
        challenge: string;
        address: string;
        amountDrops: string;
      }
    | null
  >(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [dropsInput, setDropsInput] = useState("1");
  const [xrpInput, setXrpInput] = useState("0.000001");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [relatedPlans, setRelatedPlans] = useState<RelatedPlan[]>([]);
  const [deleting, setDeleting] = useState(false);

  const title = useMemo(() => asset?.label ?? "資産詳細", [asset?.label]);

  const loadAsset = async (options?: { includeXrpl?: boolean }) => {
    if (!caseId || !assetId) return;
    const detail = await getAsset(caseId, assetId, {
      includeXrpl: Boolean(options?.includeXrpl)
    });
    setAsset(detail);
  };

  useEffect(() => {
    const run = async () => {
      if (!caseId || !assetId) {
        setError("資産IDが取得できません");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await loadAsset();
      } catch (err: any) {
        setError(err?.message ?? "資産の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [caseId, assetId]);

  const handleSync = async () => {
    if (!caseId || !assetId) return;
    setSyncing(true);
    try {
      await loadAsset({ includeXrpl: true });
    } catch (err: any) {
      setError(err?.message ?? "XRPL情報の取得に失敗しました");
    } finally {
      setSyncing(false);
    }
  };

  const handleRequestChallenge = async () => {
    if (!caseId || !assetId) return;
    setVerifyError(null);
    setVerifySuccess(null);
    try {
      const result = await requestVerifyChallenge(caseId, assetId);
      setChallenge(result);
      setDropsInput(result.amountDrops ?? "1");
      const dropsNumber = Number(result.amountDrops ?? "1");
      setXrpInput(Number.isFinite(dropsNumber) ? formatXrp(dropsNumber / 1_000_000) : "");
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
      setVerifyError(err?.message ?? "検証コードの取得に失敗しました");
    }
  };

  const normalizeNumberInput = (value: string) => {
    const cleaned = value.replace(/[^\d.]/g, "");
    const [head, ...rest] = cleaned.split(".");
    return rest.length ? `${head}.${rest.join("")}` : head;
  };

  const formatXrp = (value: number) => {
    if (!Number.isFinite(value)) return "";
    return value.toFixed(6).replace(/\.?0+$/, "");
  };

  const handleDropsChange = (value: string) => {
    const cleaned = normalizeNumberInput(value);
    setDropsInput(cleaned);
    const numeric = Number(cleaned);
    if (!Number.isFinite(numeric)) {
      setXrpInput("");
      return;
    }
    setXrpInput(formatXrp(numeric / 1_000_000));
  };

  const handleXrpChange = (value: string) => {
    const cleaned = normalizeNumberInput(value);
    setXrpInput(cleaned);
    const numeric = Number(cleaned);
    if (!Number.isFinite(numeric)) {
      setDropsInput("");
      return;
    }
    setDropsInput(String(Math.round(numeric * 1_000_000)));
  };

  const handleCopy = async (label: string, value: string) => {
    if (!value) {
      setCopyMessage("コピーできる値がありません");
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      }
      setCopyMessage(`${label}をコピーしました`);
      window.setTimeout(() => setCopyMessage(null), 1500);
    } catch {
      setCopyMessage("コピーに失敗しました");
    }
  };

  const handleConfirm = async () => {
    if (!caseId || !assetId) return;
    setVerifyError(null);
    setVerifySuccess(null);
    try {
      await confirmVerify(caseId, assetId, txHash);
      setVerifySuccess("検証が完了しました");
      setTxHash("");
      await loadAsset();
    } catch (err: any) {
      setVerifyError(err?.message ?? "検証に失敗しました");
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
        setDeleteError(apiData?.message ?? "指図に紐づいているため削除できません");
      } else {
        setDeleteError(err?.message ?? "削除に失敗しました");
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
            { label: "ケース", href: "/cases" },
            caseId ? { label: "ケース詳細", href: `/cases/${caseId}` } : { label: "ケース詳細" },
            { label: "資産詳細" }
          ]}
        />
        <div className={styles.headerRow}>
          <div className={styles.headerMain}>
            <h1 className="text-title">{title}</h1>
            {asset ? <div className={styles.address}>{asset.address}</div> : null}
          </div>
          <div className={styles.headerActions}>
            <Button size="sm" variant="ghost" onClick={handleSync} disabled={syncing}>
              <RefreshCw />
              {syncing ? "同期中..." : "最新の情報を同期"}
            </Button>
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      {loading ? null : asset ? (
        <div className={styles.contentGrid}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>基本情報</h2>
            </div>
            <div className={styles.metaGrid}>
              <div>
                <div className={styles.metaLabel}>登録日</div>
                <div className={styles.metaValue}>{formatDate(asset.createdAt)}</div>
              </div>
              <div>
                <div className={styles.metaLabel}>更新日</div>
                <div className={styles.metaValue}>{formatDate(asset.updatedAt)}</div>
              </div>
              <div>
                <div className={styles.metaLabel}>ステータス</div>
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
                      >
                        所有権を検証
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>XRPLサマリー</h2>
              <span className={styles.metaHint}>最新の取得結果を表示します</span>
            </div>
            {asset.xrpl ? (
              asset.xrpl.status === "ok" ? (
                <div className={styles.xrplGrid}>
                  <div>
                    <div className={styles.metaLabel}>残高 (XRP)</div>
                    <div className={styles.metaValue}>{asset.xrpl.balanceXrp}</div>
                  </div>
                  <div>
                    <div className={styles.metaLabel}>Ledger</div>
                    <div className={styles.metaValue}>{asset.xrpl.ledgerIndex ?? "-"}</div>
                  </div>
                  {asset.xrpl.tokens?.length ? (
                    <div className={styles.tokenList}>
                      {asset.xrpl.tokens.map((token) => (
                        <div key={`${token.currency}-${token.issuer ?? ""}`} className={styles.tokenRow}>
                          <div className={styles.tokenName}>{token.currency}</div>
                          <div className={styles.tokenIssuer}>{token.issuer ?? "native"}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyText}>トークンはありません。</div>
                  )}
                </div>
              ) : (
                <FormAlert variant="error">{asset.xrpl.message}</FormAlert>
              )
            ) : (
              <div className={styles.emptyText}>まだXRPL情報を取得していません。</div>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>同期ログ</h2>
              <span className={styles.metaHint}>最大10件</span>
            </div>
            {asset.syncLogs.length === 0 ? (
              <div className={styles.emptyText}>同期ログはありません。</div>
            ) : (
              <div className={styles.logList}>
                {asset.syncLogs.map((log) => (
                  <div key={log.id} className={styles.logRow}>
                    <div className={styles.logMain}>
                      <div className={styles.logHeader}>
                        <span
                          className={`${styles.logBadge} ${
                            log.status === "ok" ? styles.logBadgeSuccess : styles.logBadgeError
                          }`}
                        >
                          {log.status === "ok" ? "成功" : "失敗"}
                        </span>
                        <div className={styles.logSummary}>
                          Ledger {log.ledgerIndex ?? "-"} / 残高 {log.balanceXrp ?? "-"} XRP
                        </div>
                      </div>
                      <div className={styles.logMessage}>
                        {log.message ? log.message : "詳細はありません。"}
                      </div>
                    </div>
                    <div className={styles.logMeta}>{formatDate(log.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>XRPL検証</DialogTitle>
                <DialogDescription>送金情報を確認し、TXハッシュで検証します。</DialogDescription>
              </DialogHeader>
              {verifyError ? <FormAlert variant="error">{verifyError}</FormAlert> : null}
              {verifySuccess ? <FormAlert variant="success">{verifySuccess}</FormAlert> : null}
              {copyMessage ? <FormAlert variant="info">{copyMessage}</FormAlert> : null}

              <div className={styles.verifyBlock}>
                <div className={styles.verifyRow}>
                  <div>
                    <div className={styles.metaLabel}>Destination</div>
                    <div className={styles.metaValue}>{asset.verificationAddress}</div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={styles.copyButton}
                    onClick={() => handleCopy("Destination", asset.verificationAddress)}
                    aria-label="Destinationをコピー"
                  >
                    <Copy />
                  </Button>
                </div>

                <div className={styles.verifyRow}>
                  <div>
                    <div className={styles.metaLabel}>Memo</div>
                    <div className={styles.metaValue}>
                      {asset.verificationChallenge ?? challenge?.challenge ?? "未発行"}
                    </div>
                  </div>
                  <div className={styles.verifyRowActions}>
                    <Button
                      size="icon"
                      variant="secondary"
                      className={styles.iconButton}
                      onClick={handleRequestChallenge}
                      aria-label="検証コードを発行"
                    >
                      <RefreshCw />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={styles.copyButton}
                      onClick={() =>
                        handleCopy(
                          "Memo",
                          asset.verificationChallenge ?? challenge?.challenge ?? ""
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

              <FormField label="TX Hash">
                <Input
                  value={txHash}
                  onChange={(event) => setTxHash(event.target.value)}
                  placeholder="例: 7F3A..."
                />
              </FormField>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">閉じる</Button>
                </DialogClose>
                <Button size="sm" onClick={handleConfirm} disabled={!txHash.trim()}>
                  検証を完了
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}

      <div className={styles.footerActions}>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive">資産を削除</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>資産を削除しますか？</DialogTitle>
              <DialogDescription>関連する指図がある場合は削除できません。</DialogDescription>
            </DialogHeader>
            {deleteError ? <FormAlert variant="error">{deleteError}</FormAlert> : null}
            {relatedPlans.length > 0 ? (
              <div className={styles.relatedList}>
                {relatedPlans.map((plan) => (
                  <Link
                    key={plan.planId}
                    to={`/cases/${caseId}/plans/${plan.planId}/edit`}
                    className={styles.relatedLink}
                  >
                    {plan.title ?? "指図"}
                  </Link>
                ))}
              </div>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">キャンセル</Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting || relatedPlans.length > 0}
              >
                {deleting ? "削除中..." : "削除する"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
