import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { AuthLayout, Button, FormAlert, FormField, Input } from "@kototsute/ui";
import { auth } from "../../lib/firebase";
import { getAuthErrorMessage } from "../auth/authError";
import { resetSchema, type ResetForm } from "../auth/validators";
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
          <Button as={Link} variant="ghost" to="/login">
            ログインへ戻る
          </Button>
          <Button as={Link} variant="outline" to="/register">
            新規登録
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
