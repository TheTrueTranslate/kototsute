import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import AuthLayout from "../../features/shared/components/auth-layout";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
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
        message: "パスワード再設定メールを送信しました。"
      });
    } catch (error) {
      setStatus({ type: "error", message: getAuthErrorMessage(error) });
    }
  });

  return (
    <AuthLayout
      title="パスワード再設定"
      lead="登録済みのメールアドレスに再設定用リンクを送信します。"
      className={className}
      footer={
        <div className={styles.footerActions}>
          <Button asChild variant="ghost">
            <Link to="/login">ログインへ戻る</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/register">新規登録</Link>
          </Button>
        </div>
      }
    >
      <form className={styles.form} onSubmit={onSubmit}>
        {status ? (
          <FormAlert variant={status.type}>{status.message}</FormAlert>
        ) : null}
        <FormField label="メールアドレス" error={errors.email?.message} htmlFor={emailId}>
          <Input
            id={emailId}
            type="email"
            autoComplete="email"
            placeholder="example@kototsute.jp"
            {...register("email")}
          />
        </FormField>
        <Button className={styles.submit} type="submit" disabled={isSubmitting}>
          {isSubmitting ? "送信中..." : "再設定メールを送る"}
        </Button>
      </form>
    </AuthLayout>
  );
}
