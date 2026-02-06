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

type AssetTypeOption = {
  id: "xrp-wallet" | "bank" | "securities" | "real-estate";
  label: string;
  description: string;
  available: boolean;
};

export const buildAssetDetailPath = (caseId: string, assetId: string) =>
  `/cases/${caseId}/assets/${assetId}`;

export default function AssetNewPage() {
  const { caseId } = useParams();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<AssetTypeOption["id"]>("xrp-wallet");
  const [step, setStep] = useState<"type" | "form">("type");
  const navigate = useNavigate();
  const { register, handleSubmit, formState, reset } = useForm<FormValues>({
    resolver: zodResolver(assetCreateSchema)
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setSuccess(null);
    try {
      if (!caseId) {
        setError(t("assets.new.error.caseIdMissing"));
        return;
      }
      const created = await createAsset(caseId, values);
      reset();
      navigate(buildAssetDetailPath(caseId, created.assetId));
    } catch (err: any) {
      setError(err?.message ?? t("assets.new.error.createFailed"));
    }
  });

  const assetTypes: AssetTypeOption[] = [
    {
      id: "xrp-wallet",
      label: t("assets.types.xrp.label"),
      description: t("assets.types.xrp.desc"),
      available: true
    },
    {
      id: "bank",
      label: t("assets.types.bank.label"),
      description: t("assets.types.bank.desc"),
      available: false
    },
    {
      id: "securities",
      label: t("assets.types.securities.label"),
      description: t("assets.types.securities.desc"),
      available: false
    },
    {
      id: "real-estate",
      label: t("assets.types.realEstate.label"),
      description: t("assets.types.realEstate.desc"),
      available: false
    }
  ];

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
      {step === "type" ? (
        <div>
          <div className="text-section">{t("assets.new.section.type")}</div>
          <div className={styles.typeGrid}>
            {assetTypes.map((type) => {
              const isActive = type.id === selectedType;
              return (
                <button
                  key={type.id}
                  type="button"
                  className={[
                    styles.typeCard,
                    isActive ? styles.typeCardActive : null,
                    !type.available ? styles.typeCardDisabled : null
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (type.available) {
                      setSelectedType(type.id);
                    }
                  }}
                  disabled={!type.available}
                >
                  <span className={styles.typeLabel}>{type.label}</span>
                  <span className={styles.typeMeta}>{type.description}</span>
                  {!type.available ? (
                    <span className={styles.typeBadge}>{t("assets.new.type.unavailable")}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className={styles.stepActions}>
            <Button type="button" onClick={() => setStep("form")}>
              {t("assets.new.type.next")}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="text-section">{t("assets.new.section.type")}</div>
          <div className={styles.typeSummary}>
            <div className={styles.typeSummaryText}>
              {assetTypes.find((type) => type.id === selectedType)?.label ??
                t("assets.new.type.unselected")}
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStep("type");
                setError(null);
                setSuccess(null);
              }}
            >
              {t("assets.new.type.change")}
            </Button>
          </div>
        </div>
      )}
      {error ? <FormAlert variant="error">{t(error)}</FormAlert> : null}
      {success ? <FormAlert variant="success">{success}</FormAlert> : null}
      {step === "form" && selectedType === "xrp-wallet" ? (
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
      ) : null}
    </section>
  );
}
