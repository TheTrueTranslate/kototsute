import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listDeathClaims, type AdminDeathClaim } from "../api/death-claims";

const statusTabs = [
  { id: "SUBMITTED", label: "運営確認待ち" },
  { id: "ADMIN_APPROVED", label: "運営承認済み" },
  { id: "CONFIRMED", label: "死亡確定" }
] as const;

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

export default function ClaimsPage() {
  const [items, setItems] = useState<AdminDeathClaim[]>([]);
  const [status, setStatus] = useState<(typeof statusTabs)[number]["id"]>("SUBMITTED");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listDeathClaims(status);
        setItems(data);
      } catch (err: any) {
        setError(err?.message ?? "一覧の取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [status]);

  return (
    <div className="card">
      <div className="card-title">死亡診断書</div>
      <div className="tabs">
        {statusTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button ${status === tab.id ? "active" : ""}`}
            onClick={() => setStatus(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {error ? <div className="alert">{error}</div> : null}
      {loading ? (
        <div className="muted">読み込み中...</div>
      ) : items.length === 0 ? (
        <div className="muted">該当する申請はありません。</div>
      ) : (
        <div className="table">
          {items.map((item) => (
            <Link
              key={`${item.caseId}:${item.claimId}`}
              to={`/claims/${item.caseId}/${item.claimId}`}
              className="row"
            >
              <div>
                <div className="row-title">Case: {item.caseId}</div>
                <div className="row-meta">申請者: {item.submittedByUid}</div>
              </div>
              <div className="row-meta">{formatDate(item.createdAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
