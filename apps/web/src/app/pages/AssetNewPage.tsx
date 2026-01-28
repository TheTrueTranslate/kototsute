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

export default function AssetNewPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
        <h1 className="text-title">XRPウォレット登録</h1>
      </header>
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {success ? <FormAlert variant="success">{success}</FormAlert> : null}
      <form className={styles.form} onSubmit={onSubmit}>
        <FormField label="ラベル" errorMessage={formState.errors.label?.message}>
          <Input {...register("label")} placeholder="例: 自分のウォレット" />
        </FormField>
        <FormField label="XRPアドレス" errorMessage={formState.errors.address?.message}>
          <Input {...register("address")} placeholder="r..." />
        </FormField>
        <Button type="submit">登録する</Button>
      </form>
    </section>
  );
}
