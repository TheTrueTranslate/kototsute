import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createCase, listCases, type CaseSummary } from "../api/cases";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import { Button } from "../../features/shared/components/ui/button";
import { useAuth } from "../../features/auth/auth-provider";
import { useTranslation } from "react-i18next";
import styles from "../../styles/casesPage.module.css";

export default function CasesPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [created, setCreated] = useState<CaseSummary[]>([]);
  const [received, setReceived] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayName = useMemo(() => user?.displayName ?? "", [user]);

  const statusLabels: Record<string, string> = {
    DRAFT: t("cases.status.draft"),
    WAITING: t("cases.status.waiting"),
    IN_PROGRESS: t("cases.status.inProgress"),
    COMPLETED: t("cases.status.completed")
  };

  const formatDate = (value: string) => {
    try {
      return new Date(value).toLocaleDateString(i18n.language);
    } catch {
      return "-";
    }
  };

  const load = async () => {
    try {
      const casesResult = await listCases();
      setCreated(casesResult.created ?? []);
      setReceived(casesResult.received ?? []);
    } catch (err: any) {
      if (err?.status === 401 || err?.message === "UNAUTHORIZED") {
        setCreated([]);
        setReceived([]);
        return;
      }
      setError(err?.message ?? t("cases.error.load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resolveOwnerDisplayName = () => {
    const trimmed = displayName.trim();
    if (trimmed) return trimmed;
    if (user?.uid) {
      return t("cases.owner.anonymousWithId", { id: user.uid.slice(0, 6) });
    }
    return t("cases.owner.anonymous");
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      if (!user) {
        setError(t("cases.error.unauthorized"));
        return;
      }
      const createdCase = await createCase({ ownerDisplayName: resolveOwnerDisplayName() });
      setCreated([createdCase]);
    } catch (err: any) {
      setError(err?.message ?? t("cases.error.create"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs items={[{ label: t("nav.cases") }]} />
        <div className={styles.headerRow}>
          <h1 className="text-title">{t("cases.title")}</h1>
        </div>
      </header>
      {error ? <FormAlert variant="error">{t(error)}</FormAlert> : null}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t("cases.section.created")}</h2>
        </div>
        {loading ? null : created.length === 0 ? (
          <div className={styles.centerAction}>
            <Button type="button" onClick={handleCreate} disabled={creating}>
              {creating ? t("cases.create.submitting") : t("cases.create.submit")}
            </Button>
          </div>
        ) : (
          <div className={styles.list}>
            {created.map((item) => (
              <Link key={item.caseId} to={`/cases/${item.caseId}`} className={styles.rowLink}>
                <div className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{item.ownerDisplayName}</div>
                    <div className={styles.rowMeta}>
                      {t("cases.updatedAt", { date: formatDate(item.updatedAt) })}
                    </div>
                  </div>
                  <div className={styles.rowSide}>
                    <span className={styles.statusBadge}>{statusLabels[item.stage] ?? item.stage}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t("cases.section.received")}</h2>
        </div>
        {loading ? null : received.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>{t("cases.empty.received.title")}</div>
            <div className={styles.emptyBody}>{t("cases.empty.received.body")}</div>
          </div>
        ) : (
          <div className={styles.list}>
            {received.map((item) => (
              <Link key={item.caseId} to={`/cases/${item.caseId}`} className={styles.rowLink}>
                <div className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{item.ownerDisplayName}</div>
                    <div className={styles.rowMeta}>
                      {t("cases.updatedAt", { date: formatDate(item.updatedAt) })}
                    </div>
                  </div>
                  <div className={styles.rowSide}>
                    <span className={styles.statusBadge}>{statusLabels[item.stage] ?? item.stage}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
