const DEFAULT_MESSAGE = "認証に失敗しました。もう一度お試しください。";

const ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "このメールアドレスは既に登録されています",
  "auth/invalid-email": "正しいメールアドレスを入力してください",
  "auth/weak-password": "パスワードは8文字以上で入力してください",
  "auth/user-not-found": "メールアドレスまたはパスワードが正しくありません",
  "auth/wrong-password": "メールアドレスまたはパスワードが正しくありません",
  "auth/too-many-requests": "試行回数が多すぎます。しばらく待って再度お試しください"
};

type AuthErrorLike = {
  code?: string;
};

export function getAuthErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return DEFAULT_MESSAGE;
  }

  const { code } = error as AuthErrorLike;
  if (!code) {
    return DEFAULT_MESSAGE;
  }

  return ERROR_MESSAGES[code] ?? DEFAULT_MESSAGE;
}
