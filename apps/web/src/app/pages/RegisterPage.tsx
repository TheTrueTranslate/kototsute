import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import AuthLayout from "../../features/shared/components/auth-layout";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import { Button } from "../../features/shared/components/ui/button";
import { Input } from "../../features/shared/components/ui/input";
import { auth, db } from "../../features/shared/lib/firebase";
import { getAuthErrorMessage } from "../../features/auth/authError";
import { registerSchema, type RegisterForm } from "../../features/auth/validators";
import { resolveBrowserLocale } from "../../features/shared/lib/i18n";
import styles from "../../styles/authPages.module.css";

type FormStatus = {
  type: "success" | "error";
  message: string;
};

type PageProps = {
  className?: string;
};

export default function RegisterPage({ className }: PageProps) {
  const displayNameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const navigate = useNavigate();
  const [status, setStatus] = useState<FormStatus | null>(null);
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    mode: "onBlur"
  });

  const onSubmit = handleSubmit(async (data) => {
    setStatus(null);
    try {
      const credential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      await updateProfile(credential.user, { displayName: data.displayName });
      await setDoc(doc(db, "profiles", credential.user.uid), {
        uid: credential.user.uid,
        displayName: data.displayName,
        locale: resolveBrowserLocale(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      navigate("/login", { state: { registered: true } });
    } catch (error) {
      setStatus({ type: "error", message: t(getAuthErrorMessage(error)) });
    }
  });

  return (
    <AuthLayout
      title={t("auth.register.title")}
      lead={t("auth.register.lead")}
      className={className}
      footer={
        <div className={styles.footerActions}>
          <Button asChild variant="ghost">
            <Link to="/login">{t("auth.register.footer.login")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/reset">{t("auth.register.footer.reset")}</Link>
          </Button>
        </div>
      }
    >
      <form className={styles.form} onSubmit={onSubmit}>
        {status ? (
          <FormAlert variant={status.type}>{status.message}</FormAlert>
        ) : null}
        <FormField
          label={t("auth.register.form.displayName")}
          error={errors.displayName?.message}
          htmlFor={displayNameId}
        >
          <Input
            id={displayNameId}
            type="text"
            autoComplete="name"
            placeholder={t("auth.register.form.displayNamePlaceholder")}
            {...register("displayName")}
          />
        </FormField>
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
            autoComplete="new-password"
            placeholder={t("auth.common.passwordPlaceholder")}
            {...register("password")}
          />
        </FormField>
        <FormField
          label={t("auth.register.form.confirmPassword")}
          error={errors.confirmPassword?.message}
          htmlFor={confirmId}
        >
          <Input
            id={confirmId}
            type="password"
            autoComplete="new-password"
            placeholder={t("auth.register.form.confirmPasswordPlaceholder")}
            {...register("confirmPassword")}
          />
        </FormField>
        <Button className={styles.submit} type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("auth.register.submitting") : t("auth.register.submit")}
        </Button>
      </form>
    </AuthLayout>
  );
}
