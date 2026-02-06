import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import AuthLayout from "../../features/shared/components/auth-layout";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import LocaleSwitcher from "../../features/shared/components/locale-switcher";
import { Button } from "../../features/shared/components/ui/button";
import { Input } from "../../features/shared/components/ui/input";
import { auth } from "../../features/shared/lib/firebase";
import { getAuthErrorMessage } from "../../features/auth/authError";
import { resetSchema, type ResetForm } from "../../features/auth/validators";
import styles from "../../styles/authPages.module.css";

type FormStatus = {
  type: "success" | "error";
  message: string;
};

type PageProps = {
  className?: string;
};

export default function ResetPage({ className }: PageProps) {
  const emailId = useId();
  const [status, setStatus] = useState<FormStatus | null>(null);
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    mode: "onBlur"
  });

  const onSubmit = handleSubmit(async (data) => {
    setStatus(null);
    try {
      await sendPasswordResetEmail(auth, data.email);
      setStatus({
        type: "success",
        message: t("auth.reset.success")
      });
    } catch (error) {
      setStatus({ type: "error", message: t(getAuthErrorMessage(error)) });
    }
  });

  return (
    <AuthLayout
      title={t("auth.reset.title")}
      lead={t("auth.reset.lead")}
      className={className}
      footer={
        <div className={styles.footerActions}>
          <Button asChild variant="ghost">
            <Link to="/login">{t("auth.reset.footer.login")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/register">{t("auth.reset.footer.register")}</Link>
          </Button>
        </div>
      }
    >
      <form className={styles.form} onSubmit={onSubmit}>
        {status ? (
          <FormAlert variant={status.type}>{status.message}</FormAlert>
        ) : null}
        <FormField label={t("auth.common.email")} error={errors.email?.message} htmlFor={emailId}>
          <Input
            id={emailId}
            type="email"
            autoComplete="email"
            placeholder={t("auth.common.emailPlaceholder")}
            {...register("email")}
          />
        </FormField>
        <div className={styles.languageSection}>
          <LocaleSwitcher
            label={t("auth.common.languageLabel")}
            jaLabel={t("auth.common.language.ja")}
            enLabel={t("auth.common.language.en")}
          />
          <p className={styles.languageHint}>{t("auth.common.languageHintMyPage")}</p>
        </div>
        <Button className={styles.submit} type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
