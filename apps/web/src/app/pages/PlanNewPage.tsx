import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import { Button } from "../../features/shared/components/ui/button";
import { Input } from "../../features/shared/components/ui/input";
import { createPlan } from "../api/plans";
import styles from "../../styles/plansPage.module.css";

export default function PlanNewPage() {
  const { caseId } = useParams();
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
        setError("ケースIDが取得できません");
        setLoading(false);
        return;
      }
      const createdPlan = await createPlan(caseId, { title });
      if (!createdPlan?.planId) {
        throw new Error("作成した指図IDが取得できません");
      }
      navigate(`/cases/${caseId}/plans/${createdPlan.planId}`);
    } catch (err: any) {
      setError(err?.message ?? "指図の作成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: "ケース", href: "/cases" },
            caseId ? { label: "ケース詳細", href: `/cases/${caseId}` } : { label: "ケース詳細" },
            { label: "指図作成" }
          ]}
        />
        <h1 className="text-title">指図作成</h1>
      </header>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <form className={styles.form} onSubmit={handleSubmit}>
        <FormField label="タイトル">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例: 分配プラン"
          />
        </FormField>
        <div className={styles.headerActions}>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(caseId ? `/cases/${caseId}` : "/cases")}
          >
            戻る
          </Button>
          <Button type="submit" disabled={!title.trim() || loading}>
            作成する
          </Button>
        </div>
      </form>
    </section>
  );
}
