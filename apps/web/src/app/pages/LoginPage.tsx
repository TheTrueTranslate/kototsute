import { useEffect, useId, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
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
import { loginSchema, type LoginForm } from "../../features/auth/validators";
import styles from "../../styles/authPages.module.css";

type FormStatus = {
  type: "success" | "error";
  message: string;
};

type LocationState = {
  registered?: boolean;
};

type PageProps = {
  className?: string;
};

export default function LoginPage({ className }: PageProps) {
  const emailId = useId();
  const passwordId = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<FormStatus | null>(null);
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur"
  });

  useEffect(() => {
    const state = location.state as LocationState | null;
    if (state?.registered) {
      setStatus({
        type: "success",
        message: t("auth.login.registered")
      });
    }
  }, [location.state]);

  const onSubmit = handleSubmit(async (data) => {
    setStatus(null);
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      navigate("/");
    } catch (error) {
      setStatus({ type: "error", message: t(getAuthErrorMessage(error)) });
    }
  });

  return (
    <AuthLayout
      title={t("auth.login.title")}
      lead={t("auth.login.lead")}
      className={className}
      footer={
        <div className={styles.footerActions}>
          <Button asChild variant="ghost">
            <Link to="/reset">{t("auth.login.footer.reset")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/register">{t("auth.login.footer.register")}</Link>
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
        <FormField
          label={t("auth.common.password")}
          error={errors.password?.message}
          htmlFor={passwordId}
        >
          <Input
            id={passwordId}
            type="password"
            autoComplete="current-password"
            placeholder={t("auth.common.passwordPlaceholder")}
            {...register("password")}
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
          {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
