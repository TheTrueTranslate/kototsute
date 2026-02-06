import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import { Button } from "../../features/shared/components/ui/button";
import { Input } from "../../features/shared/components/ui/input";
import { createPlan, listPlans, type PlanListItem } from "../api/plans";
import styles from "../../styles/plansPage.module.css";

const toTimestamp = (value: string | null | undefined) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const resolveCreatedPlanId = (input: {
  createdPlan?: { planId?: string | null; title?: string | null } | null;
  requestedTitle: string;
  plans: PlanListItem[];
}) => {
  const directPlanId = input.createdPlan?.planId?.trim();
  if (directPlanId) return directPlanId;
  if (input.plans.length === 0) return null;

  const normalizedTitle = (input.createdPlan?.title ?? input.requestedTitle).trim();
  const sortedPlans = [...input.plans].sort(
    (a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt)
  );
  if (!normalizedTitle) {
    return sortedPlans[0]?.planId ?? null;
  }
  const matched = sortedPlans.find((plan) => plan.title.trim() === normalizedTitle);
  return matched?.planId ?? sortedPlans[0]?.planId ?? null;
};

export default function PlanNewPage() {
  const { caseId } = useParams();
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!caseId) {
        setError(t("plans.new.error.caseIdMissing"));
        setLoading(false);
        return;
      }
      const createdPlan = await createPlan(caseId, { title });
      let nextPlanId = resolveCreatedPlanId({
        createdPlan,
        requestedTitle: title,
        plans: []
      });
      if (!nextPlanId) {
        const plans = await listPlans(caseId);
        nextPlanId = resolveCreatedPlanId({
          createdPlan,
          requestedTitle: title,
          plans
        });
      }
      if (!nextPlanId) {
        throw new Error(t("plans.new.error.planIdMissing"));
      }
      navigate(`/cases/${caseId}/plans/${nextPlanId}`);
    } catch (err: any) {
      setError(err?.message ?? t("plans.new.error.createFailed"));
    } finally {
      setLoading(false);
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
            { label: t("plans.new.title") }
          ]}
        />
        <h1 className="text-title">{t("plans.new.title")}</h1>
      </header>

      {error ? <FormAlert variant="error">{t(error)}</FormAlert> : null}

      <form className={styles.form} onSubmit={handleSubmit}>
        <FormField label={t("plans.new.form.title")}>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("plans.new.form.titlePlaceholder")}
          />
        </FormField>
        <div className={styles.headerActions}>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(caseId ? `/cases/${caseId}` : "/cases")}
          >
            {t("plans.new.actions.back")}
          </Button>
          <Button type="submit" disabled={!title.trim() || loading}>
            {loading ? t("plans.new.actions.submitting") : t("plans.new.actions.submit")}
          </Button>
        </div>
      </form>
    </section>
  );
}
