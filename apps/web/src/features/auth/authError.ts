const DEFAULT_MESSAGE = "authErrors.default";

const ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "authErrors.emailAlreadyInUse",
  "auth/invalid-email": "authErrors.invalidEmail",
  "auth/weak-password": "authErrors.weakPassword",
  "auth/user-not-found": "authErrors.userNotFound",
  "auth/wrong-password": "authErrors.userNotFound",
  "auth/too-many-requests": "authErrors.tooManyRequests"
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
