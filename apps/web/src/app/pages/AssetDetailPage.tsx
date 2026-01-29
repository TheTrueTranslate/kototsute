import { useEffect, useId, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { confirmVerify, deleteAsset, getAsset, requestVerifyChallenge, type AssetDetail } from "../api/assets";
import FormAlert from "../../features/shared/components/form-alert";
import { Button } from "../../features/shared/components/ui/button";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import styles from "../../styles/assetsPage.module.css";
import { Input } from "../../features/shared/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../../features/shared/components/ui/dialog";
import { Copy } from "lucide-react";

const VERIFY_AMOUNT_DROPS = "1";
const VERIFY_AMOUNT_XRP = "0.000001";

export default function AssetDetailPage() {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const txId = useId();
  const [txHash, setTxHash] = useState("");
  const [isVerifyOpen, setVerifyOpen] = useState(false);
  const [amountUnit, setAmountUnit] = useState<"xrp" | "drops">("xrp");

  const loadAsset = async (includeXrpl = false) => {
    if (!assetId) return;
    setError(null);
    setLoading(true);
    try {
      const data = await getAsset(assetId, { includeXrpl });
      setAsset(data);
    } catch (err: any) {
      setError(err?.message ?? "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleIssueChallenge = async () => {
    if (!assetId) return;
    setVerifyLoading(true);
    try {
      const data = await requestVerifyChallenge(assetId);
      setAsset((current) =>
        current
          ? {
              ...current,
              verificationStatus: "PENDING",
              verificationChallenge: data.challenge,
              verificationAddress: data.address
            }
          : current
      );
    } catch (err: any) {
      setError(err?.message ?? "検証コードの発行に失敗しました");
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleConfirmVerify = async () => {
    if (!assetId) return;
    if (!txHash.trim()) {
      setError("tx hash を入力してください");
      return;
    }
    setVerifyLoading(true);
    try {
      await confirmVerify(assetId, txHash.trim());
      await loadAsset(true);
    } catch (err: any) {
      setError(err?.message ?? "検証に失敗しました");
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("コピーに失敗しました");
    }
  };

  useEffect(() => {
    loadAsset(true);
  }, [assetId]);

  const handleDelete = async () => {
    if (!assetId) return;
    const ok = window.confirm("この資産を削除しますか？");
    if (!ok) return;
    try {
      await deleteAsset(assetId);
      navigate("/");
    } catch (err: any) {
      setError(err?.message ?? "削除に失敗しました");
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: "資産一覧", href: "/" },
            { label: "資産詳細" }
          ]}
        />
        <div className={styles.headerRow}>
          <h1 className="text-title">資産詳細</h1>
          <div className={styles.headerActions}>
            <Button variant="outline" onClick={() => loadAsset(true)}>
              最新の状態を取得
            </Button>
            <Button variant="outlineDestructive" onClick={handleDelete}>
              削除
            </Button>
          </div>
        </div>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {loading || !asset ? null : (
        <div className={styles.detailGrid}>
          <div className={styles.detailCard}>
            <div className={styles.detailTitle}>基本情報</div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>ラベル</span>
              <span className={styles.detailValue}>{asset.label}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>アドレス</span>
              <span className={styles.detailValueMono}>{asset.address}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>登録日</span>
              <span className={styles.detailValue}>
                {new Date(asset.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>所有権</span>
              <div className={styles.verifyInline}>
                <span className={styles.detailValue}>
                  {asset.verificationStatus === "VERIFIED"
                    ? "確認済み"
                    : asset.verificationStatus === "PENDING"
                      ? "確認中"
                      : "未検証"}
                </span>
                {asset.verificationStatus !== "VERIFIED" ? (
                  <Dialog open={isVerifyOpen} onOpenChange={setVerifyOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        検証する
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>所有権の検証</DialogTitle>
                        <DialogDescription>
                          Destination に 1 drop を送金し、Memo に検証コードを入れてください。
                        </DialogDescription>
                      </DialogHeader>
                      <div className={styles.verifyBox}>
                        <div className={styles.detailRow}>
                          <span className={styles.detailLabel}>Destination</span>
                          <div className={styles.verifyInline}>
                            <span className={styles.detailValueMono}>{asset.verificationAddress}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCopy(asset.verificationAddress)}
                              aria-label="Destination をコピー"
                            >
                              <Copy />
                            </Button>
                          </div>
                        </div>
                        <div className={styles.detailRow}>
                          <span className={styles.detailLabel}>送金額</span>
                          <div className={styles.verifyInline}>
                            <div className={styles.amountSwitch}>
                              <button
                                type="button"
                                className={[
                                  styles.amountOption,
                                  amountUnit === "xrp" ? styles.amountOptionActive : null
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                onClick={() => setAmountUnit("xrp")}
                              >
                                XRP
                              </button>
                              <button
                                type="button"
                                className={[
                                  styles.amountOption,
                                  amountUnit === "drops" ? styles.amountOptionActive : null
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                onClick={() => setAmountUnit("drops")}
                              >
                                drops
                              </button>
                            </div>
                            <span className={styles.detailValueMono}>
                              {amountUnit === "xrp"
                                ? `${VERIFY_AMOUNT_XRP} XRP`
                                : `${VERIFY_AMOUNT_DROPS} drops`}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                handleCopy(amountUnit === "xrp" ? VERIFY_AMOUNT_XRP : VERIFY_AMOUNT_DROPS)
                              }
                              aria-label="送金額をコピー"
                            >
                              <Copy />
                            </Button>
                          </div>
                        </div>
                        <div className={styles.detailRow}>
                          <span className={styles.detailLabel}>Memo</span>
                          <div className={styles.verifyInline}>
                            <span className={styles.detailValueMono}>
                              {asset.verificationChallenge ?? "未発行"}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCopy(asset.verificationChallenge ?? "")}
                              disabled={!asset.verificationChallenge}
                              aria-label="Memo をコピー"
                            >
                              <Copy />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleIssueChallenge}
                              disabled={verifyLoading}
                            >
                              再生成
                            </Button>
                          </div>
                        </div>
                        <div className={styles.verifyForm}>
                          <label htmlFor={txId} className={styles.detailLabel}>
                            送金後の tx hash
                          </label>
                          <Input
                            id={txId}
                            value={txHash}
                            onChange={(event) => setTxHash(event.target.value)}
                            placeholder="例: 2F7A... のトランザクションID"
                          />
                          <Button onClick={handleConfirmVerify} disabled={verifyLoading || !txHash.trim()}>
                            検証する
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : null}
              </div>
            </div>
          </div>

          <div className={styles.detailCard}>
            <div className={styles.detailTitle}>資産状況（XRPL）</div>
            {asset.xrpl ? (
              asset.xrpl.status === "ok" ? (
                <>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>残高</span>
                    <span className={styles.detailValue}>{asset.xrpl.balanceXrp} XRP</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>レジャー</span>
                    <span className={styles.detailValue}>{asset.xrpl.ledgerIndex ?? "-"}</span>
                  </div>
                </>
              ) : (
                <div className={styles.detailMuted}>{asset.xrpl.message}</div>
              )
            ) : (
              <div className={styles.detailMuted}>まだ同期されていません。</div>
            )}
          </div>

          <div className={styles.detailCard}>
            <div className={styles.detailTitle}>同期ログ</div>
            {asset.syncLogs.length === 0 ? (
              <div className={styles.detailMuted}>同期ログはまだありません。</div>
            ) : (
              <ul className={styles.logList}>
                {asset.syncLogs.slice(0, 10).map((log) => (
                  <li key={log.id} className={styles.logRow}>
                    <span className={styles.logTime}>
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                    <span className={styles.logStatus}>
                      {log.status === "ok" ? "成功" : "失敗"}
                    </span>
                    <span className={styles.logDetail}>
                      {log.status === "ok"
                        ? `${log.balanceXrp ?? "-"} XRP`
                        : log.message ?? "-"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.detailLink}>
            <Link to="/">資産一覧に戻る</Link>
          </div>
        </div>
      )}
    </section>
  );
}
