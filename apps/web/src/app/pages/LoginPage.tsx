import { useEffect, useId, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import AuthLayout from "../../components/auth-layout";
import FormAlert from "../../components/form-alert";
import FormField from "../../components/form-field";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { auth } from "../../lib/firebase";
import { getAuthErrorMessage } from "../auth/authError";
import { loginSchema, type LoginForm } from "../auth/validators";
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
        message: "登録が完了しました。ログインしてください。"
      });
    }
  }, [location.state]);

  const onSubmit = handleSubmit(async (data) => {
    setStatus(null);
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      navigate("/");
    } catch (error) {
      setStatus({ type: "error", message: getAuthErrorMessage(error) });
    }
  });

  return (
    <AuthLayout
      title="ログイン"
      lead="登録済みのメールアドレスでログインしてください。"
      className={className}
      footer={
        <div className={styles.footerActions}>
          <Button asChild variant="ghost">
            <Link to="/reset">パスワードを忘れた方</Link>
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
        <FormField label="パスワード" error={errors.password?.message} htmlFor={passwordId}>
          <Input
            id={passwordId}
            type="password"
            autoComplete="current-password"
            placeholder="8文字以上"
            {...register("password")}
          />
        </FormField>
        <Button className={styles.submit} type="submit" disabled={isSubmitting}>
          {isSubmitting ? "ログイン中..." : "ログイン"}
        </Button>
      </form>
    </AuthLayout>
  );
}
