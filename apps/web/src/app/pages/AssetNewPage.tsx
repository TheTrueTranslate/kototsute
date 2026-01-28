import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createAsset } from "../api/assets";
import { isXrpAddress } from "@kototsute/shared";
import { Button, FormAlert, FormField, Input } from "@kototsute/ui";
import styles from "../../styles/assetsPage.module.css";

const schema = z.object({
  label: z.string().min(1, "ラベルは必須です"),
  address: z
    .string()
    .min(1, "アドレスは必須です")
    .refine((value) => isXrpAddress(value), "XRPアドレスが不正です")
});

type FormValues = z.infer<typeof schema>;

type AssetTypeOption = {
  id: "xrp-wallet" | "bank" | "securities" | "real-estate";
  label: string;
  description: string;
  available: boolean;
};

const assetTypes: AssetTypeOption[] = [
  {
    id: "xrp-wallet",
    label: "XRPウォレット",
    description: "ウォレットアドレスを登録します",
    available: true
  },
  {
    id: "bank",
    label: "銀行口座",
    description: "準備中",
    available: false
  },
  {
    id: "securities",
    label: "証券口座",
    description: "準備中",
    available: false
  },
  {
    id: "real-estate",
    label: "不動産",
    description: "準備中",
    available: false
  }
];

export default function AssetNewPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<AssetTypeOption["id"]>("xrp-wallet");
  const [step, setStep] = useState<"type" | "form">("type");
  const { register, handleSubmit, formState, reset } = useForm<FormValues>({
    resolver: zodResolver(schema)
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setSuccess(null);
    try {
      await createAsset(values);
      setSuccess("登録しました");
      reset();
    } catch (err: any) {
      setError(err?.message ?? "登録に失敗しました");
    }
  });

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className="text-title">資産登録</h1>
      </header>
      {step === "type" ? (
        <div>
          <div className="text-section">資産タイプ</div>
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
                  {!type.available ? <span className={styles.typeBadge}>準備中</span> : null}
                </button>
              );
            })}
          </div>
          <div className={styles.stepActions}>
            <Button type="button" onClick={() => setStep("form")}>
              次へ
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="text-section">資産タイプ</div>
          <div className={styles.typeSummary}>
            <div className={styles.typeSummaryText}>
              {assetTypes.find((type) => type.id === selectedType)?.label ?? "未選択"}
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
              変更する
            </Button>
          </div>
        </div>
      )}
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {success ? <FormAlert variant="success">{success}</FormAlert> : null}
      {step === "form" && selectedType === "xrp-wallet" ? (
        <form className={styles.form} onSubmit={onSubmit}>
          <FormField label="ラベル" errorMessage={formState.errors.label?.message}>
            <Input {...register("label")} placeholder="例: 自分のウォレット" />
          </FormField>
          <FormField label="XRPアドレス" errorMessage={formState.errors.address?.message}>
            <Input {...register("address")} placeholder="r..." />
          </FormField>
          <Button type="submit">登録する</Button>
        </form>
      ) : null}
    </section>
  );
}
