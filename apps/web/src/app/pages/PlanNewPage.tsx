import { useState } from "react";
import { useNavigate } from "react-router-dom";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import { Button } from "../../features/shared/components/ui/button";
import { Input } from "../../features/shared/components/ui/input";
import { createPlan } from "../api/plans";
import styles from "../../styles/plansPage.module.css";

export default function PlanNewPage() {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await createPlan({ title });
      navigate(`/plans/${result.planId}`);
    } catch (err: any) {
      setError(err?.message ?? "指図の作成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
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
          <Button type="button" variant="outline" onClick={() => navigate("/plans")}>
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
