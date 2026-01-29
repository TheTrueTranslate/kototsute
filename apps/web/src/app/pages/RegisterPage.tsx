import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import AuthLayout from "../../features/shared/components/auth-layout";
import FormAlert from "../../features/shared/components/form-alert";
import FormField from "../../features/shared/components/form-field";
import { Button } from "../../features/shared/components/ui/button";
import { Input } from "../../features/shared/components/ui/input";
import { auth } from "../../features/shared/lib/firebase";
import { getAuthErrorMessage } from "../../features/auth/authError";
import { registerSchema, type RegisterForm } from "../../features/auth/validators";
import styles from "../../styles/authPages.module.css";

type FormStatus = {
  type: "success" | "error";
  message: string;
};

type PageProps = {
  className?: string;
};

export default function RegisterPage({ className }: PageProps) {
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const navigate = useNavigate();
  const [status, setStatus] = useState<FormStatus | null>(null);

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
      await createUserWithEmailAndPassword(auth, data.email, data.password);
      navigate("/login", { state: { registered: true } });
    } catch (error) {
      setStatus({ type: "error", message: getAuthErrorMessage(error) });
    }
  });

  return (
    <AuthLayout
      title="新規登録"
      lead="メールアドレスとパスワードだけで登録できます。"
      className={className}
      footer={
        <div className={styles.footerActions}>
          <Button asChild variant="ghost">
            <Link to="/login">ログインへ</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/reset">パスワード再設定</Link>
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
        <FormField label="パスワード" error={errors.password?.message} htmlFor={passwordId}>
          <Input
            id={passwordId}
            type="password"
            autoComplete="new-password"
            placeholder="8文字以上"
            {...register("password")}
          />
        </FormField>
        <FormField
          label="パスワード（確認）"
          error={errors.confirmPassword?.message}
          htmlFor={confirmId}
        >
          <Input
            id={confirmId}
            type="password"
            autoComplete="new-password"
            placeholder="同じパスワードを入力"
            {...register("confirmPassword")}
          />
        </FormField>
        <Button className={styles.submit} type="submit" disabled={isSubmitting}>
          {isSubmitting ? "登録中..." : "登録する"}
        </Button>
      </form>
    </AuthLayout>
  );
}
