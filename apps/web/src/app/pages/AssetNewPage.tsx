import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createAsset } from "../api/assets";
import { assetCreateSchema } from "@kototsute/shared";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import { Button } from "../../features/shared/components/ui/button";
import { Input } from "../../features/shared/components/ui/input";
import styles from "../../styles/assetsPage.module.css";
import { useNavigate, useParams } from "react-router-dom";
import Breadcrumbs from "../../features/shared/components/breadcrumbs";
import { useTranslation } from "react-i18next";

type FormValues = z.infer<typeof assetCreateSchema>;

export const buildAssetDetailPath = (caseId: string, assetId: string) =>
  `/cases/${caseId}/assets/${assetId}`;

export const navigateToCreatedAssetDetail = (
  navigate: (path: string) => void,
  caseId: string,
  assetId: string
) => {
  navigate(buildAssetDetailPath(caseId, assetId));
};

export default function AssetNewPage() {
  const { caseId } = useParams();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { register, handleSubmit, formState, reset } = useForm<FormValues>({
    resolver: zodResolver(assetCreateSchema)
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      if (!caseId) {
        setError(t("assets.new.error.caseIdMissing"));
        return;
      }
      const created = await createAsset(caseId, values);
      reset();
      navigateToCreatedAssetDetail(navigate, caseId, created.assetId);
    } catch (err: any) {
      setError(err?.message ?? t("assets.new.error.createFailed"));
    }
  });

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Breadcrumbs
          items={[
            { label: t("nav.cases"), href: "/cases" },
            caseId
              ? { label: t("cases.detail.title"), href: `/cases/${caseId}` }
              : { label: t("cases.detail.title") },
            { label: t("assets.new.title") }
          ]}
        />
        <h1 className="text-title">{t("assets.new.title")}</h1>
      </header>
      {error ? <FormAlert variant="error">{t(error)}</FormAlert> : null}
      <form className={styles.form} onSubmit={onSubmit}>
        <FormField label={t("assets.new.form.label")} error={formState.errors.label?.message}>
          <Input {...register("label")} placeholder={t("assets.new.form.labelPlaceholder")} />
        </FormField>
        <FormField
          label={t("assets.new.form.address")}
          error={formState.errors.address?.message}
        >
          <Input {...register("address")} placeholder={t("assets.new.form.addressPlaceholder")} />
        </FormField>
        <Button type="submit">{t("assets.new.form.submit")}</Button>
      </form>
    </section>
  );
}
