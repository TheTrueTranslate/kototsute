# Localization (i18n) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Web/Admin/Backend で日本語と英語を切り替えられる状態にし、翻訳は `packages/shared/src/locales/` の1フォルダで一元管理する。

**Architecture:** `@kototsute/shared` に i18next の共通初期化と翻訳リソースを置き、フロントは `react-i18next`、バックエンドは i18next で同一キーを参照する。ユーザーの言語設定は Firestore `profiles/{uid}.locale` に保存する。

**Tech Stack:** i18next, react-i18next, React, Vite, Firebase Auth/Firestore, Hono

**Notes:**
- このリポジトリは `git worktree` を使わないため、現行ワークスペースで実装する。
- Functions を修正したら `task functions:build` を実行する。

### Task 1: 共有 i18n 基盤と翻訳リソースを追加

**Files:**
- Create: `packages/shared/src/locales/ja.json`
- Create: `packages/shared/src/locales/en.json`
- Create: `packages/shared/src/i18n/index.ts`
- Create: `packages/shared/src/i18n/locales.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: 失敗するテストを書く**

```ts
// packages/shared/src/i18n/locales.test.ts
import { describe, it, expect } from "vitest";
import ja from "../locales/ja.json" assert { type: "json" };
import en from "../locales/en.json" assert { type: "json" };

const flattenKeys = (input: Record<string, any>, prefix = ""): string[] => {
  return Object.entries(input).flatMap(([key, value]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, any>, next);
    }
    return [next];
  });
};

describe("locales", () => {
  it("ja/en のキーが一致する", () => {
    const jaKeys = flattenKeys(ja).sort();
    const enKeys = flattenKeys(en).sort();
    expect(jaKeys).toEqual(enKeys);
  });
});
```

**Step 2: テストを実行して失敗を確認**

Run: `pnpm -C packages/shared test`  
Expected: FAIL (ロケールファイル未作成/未初期化)

**Step 3: 最小の翻訳リソースを追加**

```json
// packages/shared/src/locales/ja.json
{
  "common": {
    "ok": "OK",
    "cancel": "キャンセル",
    "loading": "読み込み中...",
    "logout": "ログアウト"
  },
  "errors": {
    "UNAUTHORIZED": "認証が必要です",
    "FORBIDDEN": "権限がありません",
    "NOT_FOUND": "見つかりませんでした",
    "INTERNAL_ERROR": "サーバーでエラーが発生しました",
    "VALIDATION_ERROR": "入力が不正です",
    "CONFLICT": "既に処理済みです"
  }
}
```

```json
// packages/shared/src/locales/en.json
{
  "common": {
    "ok": "OK",
    "cancel": "Cancel",
    "loading": "Loading...",
    "logout": "Sign out"
  },
  "errors": {
    "UNAUTHORIZED": "Authentication required",
    "FORBIDDEN": "You do not have permission",
    "NOT_FOUND": "Not found",
    "INTERNAL_ERROR": "Internal server error",
    "VALIDATION_ERROR": "Invalid input",
    "CONFLICT": "Already processed"
  }
}
```

**Step 4: 共有 i18n モジュールを追加**

```ts
// packages/shared/src/i18n/index.ts
import i18next, { type i18n, type Module } from "i18next";
import ja from "../locales/ja.json" assert { type: "json" };
import en from "../locales/en.json" assert { type: "json" };

export const supportedLocales = ["ja", "en"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const normalizeLocale = (
  value: string | null | undefined
): SupportedLocale | null => {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("en")) return "en";
  return null;
};

const resources = {
  ja: { translation: ja },
  en: { translation: en }
};

const instance: i18n = i18next.createInstance();
let initialized = false;

export const initI18n = async (input?: {
  lng?: SupportedLocale;
  plugins?: Module[];
}) => {
  if (initialized) return instance;
  input?.plugins?.forEach((plugin) => instance.use(plugin));
  await instance.init({
    resources,
    lng: input?.lng ?? "ja",
    fallbackLng: "ja",
    supportedLngs: supportedLocales,
    interpolation: { escapeValue: false },
    initImmediate: false,
    react: { useSuspense: false }
  });
  initialized = true;
  return instance;
};

export const t = (key: string, options?: Record<string, any> & { locale?: SupportedLocale }) => {
  const locale = options?.locale;
  return instance.t(key, { ...options, lng: locale });
};

export const setLocale = async (locale: SupportedLocale) => {
  if (!initialized) {
    await initI18n({ lng: locale });
  }
  return instance.changeLanguage(locale);
};

export const getLocale = (): SupportedLocale => {
  return (instance.language as SupportedLocale) ?? "ja";
};

export { instance as i18n };
```

**Step 5: 共有エクスポートと依存追加**

```ts
// packages/shared/src/index.ts
export * from "./i18n/index.js";
```

```json
// packages/shared/package.json (dependencies に追加)
{
  "dependencies": {
    "i18next": "^23.11.0"
  }
}
```

**Step 6: テストを再実行**

Run: `pnpm -C packages/shared test`  
Expected: PASS

**Step 7: コミット**

```bash
git add -f packages/shared/src/locales/ja.json packages/shared/src/locales/en.json \
  packages/shared/src/i18n/index.ts packages/shared/src/i18n/locales.test.ts \
  packages/shared/src/index.ts packages/shared/package.json pnpm-lock.yaml
git commit -m "i18n基盤を追加"
```

### Task 2: バリデーション文言を i18n キー化

**Files:**
- Modify: `packages/shared/src/validation/asset-schema.ts`
- Modify: `packages/shared/src/validation/invite-schema.ts`
- Modify: `packages/shared/src/validation/plan-schema.ts`
- Modify: `packages/shared/src/validation/case-schema.ts`
- Modify: `packages/shared/src/validation/*.test.ts`
- Modify: `packages/shared/src/locales/ja.json`
- Modify: `packages/shared/src/locales/en.json`

**Step 1: 失敗するテストを書く**

```ts
// 例: packages/shared/src/validation/asset-schema.test.ts
expect(result.error?.issues[0]?.message).toBe("validation.asset.label.required");
```

**Step 2: テストを実行して失敗を確認**

Run: `pnpm -C packages/shared test`  
Expected: FAIL (メッセージが旧日本語)

**Step 3: スキーマのメッセージをキー化**

```ts
// packages/shared/src/validation/case-schema.ts
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "validation.displayName.required")
  .max(50, "validation.displayName.max");
```

```ts
// packages/shared/src/validation/invite-schema.ts
const base = z.object({
  email: z.string().email("validation.email.invalid"),
  relationLabel: z.string().min(1, "validation.relation.required"),
  relationOther: z.string().optional(),
  memo: z.string().max(400, "validation.memo.max").optional()
});

if (values.relationLabel === "その他" && !values.relationOther?.trim()) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["relationOther"],
    message: "validation.relationOther.required"
  });
}
```

**Step 4: 翻訳キーを追加**

```json
// packages/shared/src/locales/ja.json (追記)
{
  "validation": {
    "displayName": {
      "required": "表示名を入力してください",
      "max": "表示名は50文字以内で入力してください"
    },
    "email": { "invalid": "正しいメールアドレスを入力してください" },
    "relation": { "required": "関係は必須です" },
    "relationOther": { "required": "その他の関係を入力してください" },
    "memo": { "max": "メモは400文字以内で入力してください" },
    "asset": {
      "label": { "required": "ラベルは必須です" },
      "address": {
        "required": "アドレスは必須です",
        "invalid": "XRPアドレスが不正です"
      },
      "token": {
        "currency": "通貨コードは必須です",
        "duplicate": "同じトークンは1度だけ指定できます"
      },
      "numeric": "数値で入力してください"
    },
    "plan": {
      "title": { "required": "タイトルは必須です" },
      "allocation": {
        "min": "配分は0以上で入力してください",
        "percentMax": "割合の合計は100%以下にしてください"
      }
    }
  }
}
```

```json
// packages/shared/src/locales/en.json (追記)
{
  "validation": {
    "displayName": {
      "required": "Display name is required",
      "max": "Display name must be 50 characters or fewer"
    },
    "email": { "invalid": "Please enter a valid email address" },
    "relation": { "required": "Relation is required" },
    "relationOther": { "required": "Please enter the relation" },
    "memo": { "max": "Memo must be 400 characters or fewer" },
    "asset": {
      "label": { "required": "Label is required" },
      "address": {
        "required": "Address is required",
        "invalid": "Invalid XRP address"
      },
      "token": {
        "currency": "Currency code is required",
        "duplicate": "Each token must be unique"
      },
      "numeric": "Please enter a number"
    },
    "plan": {
      "title": { "required": "Title is required" },
      "allocation": {
        "min": "Allocation must be 0 or greater",
        "percentMax": "Total percentage must be 100% or less"
      }
    }
  }
}
```

**Step 5: テストを再実行**

Run: `pnpm -C packages/shared test`  
Expected: PASS

**Step 6: コミット**

```bash
git add -f packages/shared/src/validation/*.ts packages/shared/src/validation/*.test.ts \
  packages/shared/src/locales/ja.json packages/shared/src/locales/en.json
git commit -m "バリデーション文言をキー化"
```

### Task 3: Web の i18n 初期化とロケール保持を追加

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/features/shared/lib/i18n.ts`
- Create: `apps/web/src/features/shared/providers/LocaleProvider.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/app/main.tsx`
- Modify: `apps/web/src/features/shared/lib/api.ts`
- Modify: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`
- Modify: `pnpm-lock.yaml`

**Step 1: 依存を追加**

```json
// apps/web/package.json (dependencies に追加)
{
  "dependencies": {
    "i18next": "^23.11.0",
    "react-i18next": "^14.1.0"
  }
}
```

**Step 2: i18n 初期化ヘルパを作成**

```ts
// apps/web/src/features/shared/lib/i18n.ts
import { initReactI18next } from "react-i18next";
import {
  initI18n,
  i18n,
  normalizeLocale,
  type SupportedLocale
} from "@kototsute/shared";

let initialized = false;

export const initWebI18n = async (lng?: SupportedLocale) => {
  if (!initialized) {
    await initI18n({
      lng,
      plugins: [initReactI18next]
    });
    initialized = true;
  }
  return i18n;
};

export const resolveBrowserLocale = (): SupportedLocale => {
  if (typeof window === "undefined") return "ja";
  const stored = window.localStorage.getItem("locale");
  const storedLocale = normalizeLocale(stored);
  if (storedLocale) return storedLocale;
  const browser = normalizeLocale(window.navigator.language);
  return browser ?? "ja";
};
```

**Step 3: LocaleProvider を追加**

```tsx
// apps/web/src/features/shared/providers/LocaleProvider.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "../../auth/auth-provider";
import { db } from "../lib/firebase";
import { initWebI18n, resolveBrowserLocale } from "../lib/i18n";
import { setLocale, type SupportedLocale } from "@kototsute/shared";

type LocaleState = {
  locale: SupportedLocale;
  loading: boolean;
  updateLocale: (next: SupportedLocale, persist?: boolean) => Promise<void>;
};

const LocaleContext = createContext<LocaleState | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [locale, setLocaleState] = useState<SupportedLocale>(resolveBrowserLocale());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void initWebI18n(locale);
  }, [locale]);

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      const snap = await getDoc(doc(db, "profiles", user.uid));
      const saved = snap.data()?.locale as SupportedLocale | undefined;
      if (saved) {
        setLocaleState(saved);
        await setLocale(saved);
      }
      setLoading(false);
    };
    void load();
  }, [user]);

  const updateLocale = async (next: SupportedLocale, persist = true) => {
    setLocaleState(next);
    await setLocale(next);
    window.localStorage.setItem("locale", next);
    if (persist && user) {
      await setDoc(doc(db, "profiles", user.uid), { locale: next }, { merge: true });
    }
  };

  const value = useMemo(() => ({ locale, loading, updateLocale }), [locale, loading]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider.");
  return ctx;
}
```

**Step 4: App と main に組み込み**

```tsx
// apps/web/src/app/App.tsx
export default function App() {
  return (
    <AuthProvider>
      <LocaleProvider>
        <AppShell />
      </LocaleProvider>
    </AuthProvider>
  );
}
```

```tsx
// apps/web/src/app/main.tsx
import { initWebI18n, resolveBrowserLocale } from "../features/shared/lib/i18n";

void initWebI18n(resolveBrowserLocale());
```

**Step 5: API にロケールヘッダを付与**

```ts
// apps/web/src/features/shared/lib/api.ts
import { getLocale } from "@kototsute/shared";

headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
  "X-Locale": getLocale(),
  ...(options.headers ?? {})
}
```

**Step 6: テスト初期化を追加**

```ts
// apps/web/vitest.config.ts
test: {
  environment: "node",
  include: ["src/**/*.test.ts"],
  setupFiles: ["src/test/setup.ts"],
  passWithNoTests: true
}
```

```ts
// apps/web/src/test/setup.ts
import { initWebI18n } from "../features/shared/lib/i18n";
void initWebI18n("ja");
```

**Step 7: 依存の反映**

Run: `pnpm -w install`  
Expected: lockfile 更新

**Step 8: コミット**

```bash
git add apps/web/package.json apps/web/src/features/shared/lib/i18n.ts \
  apps/web/src/features/shared/providers/LocaleProvider.tsx \
  apps/web/src/app/App.tsx apps/web/src/app/main.tsx apps/web/src/features/shared/lib/api.ts \
  apps/web/vitest.config.ts apps/web/src/test/setup.ts pnpm-lock.yaml
git commit -m "webのi18n初期化を追加"
```

### Task 4: Web のロケール設定 UI と認証エラーを翻訳対応

**Files:**
- Modify: `apps/web/src/app/pages/MyPage.tsx`
- Modify: `apps/web/src/app/pages/RegisterPage.tsx`
- Modify: `apps/web/src/app/pages/LoginPage.tsx`
- Modify: `apps/web/src/app/pages/ResetPage.tsx`
- Modify: `apps/web/src/features/auth/authError.ts`
- Modify: `apps/web/src/features/auth/authError.test.ts`
- Modify: `packages/shared/src/locales/ja.json`
- Modify: `packages/shared/src/locales/en.json`

**Step 1: 認証エラーのキー化**

```ts
// apps/web/src/features/auth/authError.ts
const DEFAULT_MESSAGE = "authErrors.default";

const ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "authErrors.emailAlreadyInUse",
  "auth/invalid-email": "authErrors.invalidEmail",
  "auth/weak-password": "authErrors.weakPassword",
  "auth/user-not-found": "authErrors.userNotFound",
  "auth/wrong-password": "authErrors.userNotFound",
  "auth/too-many-requests": "authErrors.tooManyRequests"
};
```

**Step 2: ページ側で `t()` を適用**

```tsx
// apps/web/src/app/pages/LoginPage.tsx (例)
const { t } = useTranslation();
setStatus({ type: "error", message: t(getAuthErrorMessage(error)) });
```

**Step 3: MyPage に言語設定 UI を追加**

```tsx
// apps/web/src/app/pages/MyPage.tsx (例)
const { t } = useTranslation();
const { locale, updateLocale } = useLocale();

<div className={styles.row}>
  <span className={styles.label}>{t("myPage.language.label")}</span>
  <div className={styles.actionsInline}>
    <Button type="button" variant={locale === "ja" ? "default" : "outline"} onClick={() => updateLocale("ja")}>
      {t("myPage.language.ja")}
    </Button>
    <Button type="button" variant={locale === "en" ? "default" : "outline"} onClick={() => updateLocale("en")}>
      {t("myPage.language.en")}
    </Button>
  </div>
</div>
```

**Step 4: Register 時に初期ロケールを保存**

```ts
await setDoc(doc(db, "profiles", credential.user.uid), {
  uid: credential.user.uid,
  displayName: data.displayName,
  locale: resolveBrowserLocale(),
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
});
```

**Step 5: 翻訳キーを追加**

```json
// packages/shared/src/locales/ja.json (追記)
{
  "authErrors": {
    "default": "認証に失敗しました。もう一度お試しください。",
    "emailAlreadyInUse": "このメールアドレスは既に登録されています",
    "invalidEmail": "正しいメールアドレスを入力してください",
    "weakPassword": "パスワードは8文字以上で入力してください",
    "userNotFound": "メールアドレスまたはパスワードが正しくありません",
    "tooManyRequests": "試行回数が多すぎます。しばらく待って再度お試しください"
  },
  "myPage": {
    "language": {
      "label": "表示言語",
      "ja": "日本語",
      "en": "English"
    }
  }
}
```

```json
// packages/shared/src/locales/en.json (追記)
{
  "authErrors": {
    "default": "Authentication failed. Please try again.",
    "emailAlreadyInUse": "This email is already registered",
    "invalidEmail": "Please enter a valid email address",
    "weakPassword": "Password must be at least 8 characters",
    "userNotFound": "Email or password is incorrect",
    "tooManyRequests": "Too many attempts. Please try again later."
  },
  "myPage": {
    "language": {
      "label": "Language",
      "ja": "Japanese",
      "en": "English"
    }
  }
}
```

**Step 6: テスト更新**

```ts
// apps/web/src/features/auth/authError.test.ts
expect(getAuthErrorMessage({ code: "auth/email-already-in-use" }))
  .toBe("authErrors.emailAlreadyInUse");
```

**Step 7: コミット**

```bash
git add apps/web/src/app/pages/MyPage.tsx apps/web/src/app/pages/RegisterPage.tsx \
  apps/web/src/app/pages/LoginPage.tsx apps/web/src/app/pages/ResetPage.tsx \
  apps/web/src/features/auth/authError.ts apps/web/src/features/auth/authError.test.ts \
  packages/shared/src/locales/ja.json packages/shared/src/locales/en.json
git commit -m "ロケール設定と認証文言を追加"
```

### Task 5: Web の共通コンポーネントを翻訳対応

**Files:**
- Modify: `apps/web/src/features/shared/components/app-sidebar.tsx`
- Modify: `apps/web/src/features/shared/components/breadcrumbs.tsx`
- Modify: `apps/web/src/features/shared/components/site-header.tsx`
- Modify: `apps/web/src/features/shared/components/site-footer.tsx`
- Modify: `apps/web/src/features/shared/components/wallet-verify-panel.tsx`
- Modify: `apps/web/src/features/shared/components/ui/dialog.tsx`
- Modify: `apps/web/src/features/shared/components/form-field.tsx`
- Modify: `packages/shared/src/locales/ja.json`
- Modify: `packages/shared/src/locales/en.json`

**Step 1: useTranslation を導入して文字列を置換**

```tsx
// apps/web/src/features/shared/components/breadcrumbs.tsx (例)
const { t } = useTranslation();
const routeLabels: Record<string, string> = {
  "/": t("nav.home"),
  "/cases": t("nav.cases"),
  "/notifications": t("nav.notifications"),
  "/invites": t("nav.invites"),
  "/login": t("nav.login"),
  "/register": t("nav.register"),
  "/reset": t("nav.reset"),
  "/me": t("nav.myPage")
};
```

**Step 2: FormField のエラーメッセージを t() で表示**

```tsx
// apps/web/src/features/shared/components/form-field.tsx
const { t } = useTranslation();
{error ? <p role="alert">{t(error)}</p> : null}
```

**Step 3: 翻訳キーを追加**

```json
// packages/shared/src/locales/ja.json (追記)
{
  "nav": {
    "home": "ホーム",
    "cases": "ケース",
    "notifications": "通知",
    "invites": "招待",
    "login": "ログイン",
    "register": "新規登録",
    "reset": "パスワードリセット",
    "myPage": "マイページ"
  },
  "common": {
    "close": "閉じる"
  }
}
```

```json
// packages/shared/src/locales/en.json (追記)
{
  "nav": {
    "home": "Home",
    "cases": "Cases",
    "notifications": "Notifications",
    "invites": "Invites",
    "login": "Sign in",
    "register": "Sign up",
    "reset": "Reset password",
    "myPage": "My page"
  },
  "common": {
    "close": "Close"
  }
}
```

**Step 4: テストを実行**

Run: `pnpm -C apps/web test`  
Expected: PASS

**Step 5: コミット**

```bash
git add apps/web/src/features/shared/components/app-sidebar.tsx \
  apps/web/src/features/shared/components/breadcrumbs.tsx \
  apps/web/src/features/shared/components/site-header.tsx \
  apps/web/src/features/shared/components/site-footer.tsx \
  apps/web/src/features/shared/components/wallet-verify-panel.tsx \
  apps/web/src/features/shared/components/ui/dialog.tsx \
  apps/web/src/features/shared/components/form-field.tsx \
  packages/shared/src/locales/ja.json packages/shared/src/locales/en.json
git commit -m "共通UIを翻訳対応"
```

### Task 6: Web のページを翻訳対応（認証/ホーム）

**Files:**
- Modify: `apps/web/src/app/pages/HomePage.tsx`
- Modify: `apps/web/src/app/pages/LoginPage.tsx`
- Modify: `apps/web/src/app/pages/RegisterPage.tsx`
- Modify: `apps/web/src/app/pages/ResetPage.tsx`
- Modify: `packages/shared/src/locales/ja.json`
- Modify: `packages/shared/src/locales/en.json`

**Step 1: 文字列を `t()` に置換**

```tsx
const { t } = useTranslation();
<AuthLayout title={t("auth.login.title")} lead={t("auth.login.lead")} />
```

**Step 2: 翻訳キーを追加**

```json
// packages/shared/src/locales/ja.json (追記)
{
  "auth": {
    "login": { "title": "ログイン", "lead": "登録済みのアカウントでログインします。" },
    "register": { "title": "新規登録", "lead": "メールアドレスとパスワードだけで登録できます。" },
    "reset": { "title": "パスワード再設定", "lead": "登録したメールアドレスへ再設定リンクを送ります。" }
  }
}
```

```json
// packages/shared/src/locales/en.json (追記)
{
  "auth": {
    "login": { "title": "Sign in", "lead": "Sign in with your registered account." },
    "register": { "title": "Sign up", "lead": "Create an account with email and password." },
    "reset": { "title": "Reset password", "lead": "We will send a reset link to your email." }
  }
}
```

**Step 3: テストを実行**

Run: `pnpm -C apps/web test`  
Expected: PASS

**Step 4: コミット**

```bash
git add apps/web/src/app/pages/HomePage.tsx apps/web/src/app/pages/LoginPage.tsx \
  apps/web/src/app/pages/RegisterPage.tsx apps/web/src/app/pages/ResetPage.tsx \
  packages/shared/src/locales/ja.json packages/shared/src/locales/en.json
git commit -m "認証ページを翻訳対応"
```

### Task 7: Web のケース/資産/指図ページを翻訳対応

**Files:**
- Modify: `apps/web/src/app/pages/CasesPage.tsx`
- Modify: `apps/web/src/app/pages/CaseDetailPage.tsx`
- Modify: `apps/web/src/app/pages/CasePlanDetailPage.tsx`
- Modify: `apps/web/src/app/pages/AssetNewPage.tsx`
- Modify: `apps/web/src/app/pages/AssetDetailPage.tsx`
- Modify: `apps/web/src/app/pages/AssetLockPage.tsx`
- Modify: `apps/web/src/app/pages/PlanNewPage.tsx`
- Modify: `apps/web/src/app/pages/PlanEditPage.tsx`
- Modify: `packages/shared/src/locales/ja.json`
- Modify: `packages/shared/src/locales/en.json`

**Step 1: 文字列を `t()` に置換**

```tsx
const { t } = useTranslation();
<h1 className="text-title">{t("cases.title")}</h1>
```

**Step 2: 翻訳キーを追加**

```json
// packages/shared/src/locales/ja.json (追記)
{
  "cases": { "title": "ケース一覧" },
  "assets": { "newTitle": "資産の追加" },
  "plans": { "newTitle": "指図を作成", "editTitle": "指図を編集" }
}
```

```json
// packages/shared/src/locales/en.json (追記)
{
  "cases": { "title": "Cases" },
  "assets": { "newTitle": "Add asset" },
  "plans": { "newTitle": "Create plan", "editTitle": "Edit plan" }
}
```

**Step 3: テストを実行**

Run: `pnpm -C apps/web test`  
Expected: PASS

**Step 4: コミット**

```bash
git add apps/web/src/app/pages/CasesPage.tsx apps/web/src/app/pages/CaseDetailPage.tsx \
  apps/web/src/app/pages/CasePlanDetailPage.tsx apps/web/src/app/pages/AssetNewPage.tsx \
  apps/web/src/app/pages/AssetDetailPage.tsx apps/web/src/app/pages/AssetLockPage.tsx \
  apps/web/src/app/pages/PlanNewPage.tsx apps/web/src/app/pages/PlanEditPage.tsx \
  packages/shared/src/locales/ja.json packages/shared/src/locales/en.json
git commit -m "ケース/資産/指図ページを翻訳対応"
```

### Task 8: Web の招待/通知/マイページを翻訳対応

**Files:**
- Modify: `apps/web/src/app/pages/InvitesPage.tsx`
- Modify: `apps/web/src/app/pages/NotificationsPage.tsx`
- Modify: `apps/web/src/app/pages/MyPage.tsx`
- Modify: `packages/shared/src/locales/ja.json`
- Modify: `packages/shared/src/locales/en.json`

**Step 1: 文字列を `t()` に置換**

```tsx
const { t } = useTranslation();
<h1>{t("invites.title")}</h1>
```

**Step 2: 翻訳キーを追加**

```json
// packages/shared/src/locales/ja.json (追記)
{
  "invites": { "title": "招待" },
  "notifications": { "title": "通知" }
}
```

```json
// packages/shared/src/locales/en.json (追記)
{
  "invites": { "title": "Invites" },
  "notifications": { "title": "Notifications" }
}
```

**Step 3: テストを実行**

Run: `pnpm -C apps/web test`  
Expected: PASS

**Step 4: コミット**

```bash
git add apps/web/src/app/pages/InvitesPage.tsx apps/web/src/app/pages/NotificationsPage.tsx \
  apps/web/src/app/pages/MyPage.tsx packages/shared/src/locales/ja.json \
  packages/shared/src/locales/en.json
git commit -m "招待/通知/マイページを翻訳対応"
```

### Task 9: Admin の i18n 初期化と翻訳対応

**Files:**
- Modify: `apps/admin/package.json`
- Create: `apps/admin/src/lib/i18n.ts`
- Modify: `apps/admin/src/lib/api.ts`
- Modify: `apps/admin/src/main.tsx`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/pages/LoginPage.tsx`
- Modify: `apps/admin/src/pages/ClaimsPage.tsx`
- Modify: `apps/admin/src/pages/ClaimDetailPage.tsx`
- Create: `apps/admin/vitest.config.ts`
- Create: `apps/admin/src/test/setup.ts`
- Modify: `packages/shared/src/locales/ja.json`
- Modify: `packages/shared/src/locales/en.json`
- Modify: `pnpm-lock.yaml`

**Step 1: 依存を追加**

```json
// apps/admin/package.json (dependencies に追加)
{
  "dependencies": {
    "i18next": "^23.11.0",
    "react-i18next": "^14.1.0"
  }
}
```

**Step 2: i18n 初期化**

```ts
// apps/admin/src/lib/i18n.ts
import { initReactI18next } from "react-i18next";
import { initI18n, i18n, normalizeLocale } from "@kototsute/shared";

let initialized = false;

export const initAdminI18n = async (lng?: "ja" | "en") => {
  if (!initialized) {
    await initI18n({ lng, plugins: [initReactI18next] });
    initialized = true;
  }
  return i18n;
};

export const resolveAdminLocale = () => {
  const stored = window.localStorage.getItem("admin-locale");
  return normalizeLocale(stored) ?? "ja";
};
```

**Step 3: main で初期化し、App で UI を置換**

```tsx
// apps/admin/src/main.tsx
import { initAdminI18n, resolveAdminLocale } from "./lib/i18n";
void initAdminI18n(resolveAdminLocale());
```

```tsx
const { t } = useTranslation();
<div className="app-title">{t("admin.title")}</div>
```

**Step 4: 言語切替 UI を追加**

```tsx
// apps/admin/src/App.tsx (例)
const [locale, setLocaleState] = useState(resolveAdminLocale());
const switchLocale = async (next: "ja" | "en") => {
  setLocaleState(next);
  window.localStorage.setItem("admin-locale", next);
  await setLocale(next);
};
```

**Step 5: API ヘッダにロケール付与**

```ts
import { getLocale } from "@kototsute/shared";
"X-Locale": getLocale()
```

**Step 6: テスト設定**

```ts
// apps/admin/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.ts"]
  }
});
```

```ts
// apps/admin/src/test/setup.ts
import { initAdminI18n } from "../lib/i18n";
void initAdminI18n("ja");
```

**Step 7: 翻訳キー追加**

```json
// packages/shared/src/locales/ja.json (追記)
{
  "admin": {
    "title": "ことづて 管理",
    "subtitle": "死亡診断書の承認管理",
    "noAccess": "権限がありません"
  }
}
```

```json
// packages/shared/src/locales/en.json (追記)
{
  "admin": {
    "title": "Kototsute Admin",
    "subtitle": "Death certificate approvals",
    "noAccess": "Access denied"
  }
}
```

**Step 8: 依存の反映**

Run: `pnpm -w install`  
Expected: lockfile 更新

**Step 9: コミット**

```bash
git add apps/admin/package.json apps/admin/src/lib/i18n.ts apps/admin/src/lib/api.ts \
  apps/admin/src/main.tsx apps/admin/src/App.tsx apps/admin/src/pages/LoginPage.tsx \
  apps/admin/src/pages/ClaimsPage.tsx apps/admin/src/pages/ClaimDetailPage.tsx \
  apps/admin/vitest.config.ts apps/admin/src/test/setup.ts \
  packages/shared/src/locales/ja.json packages/shared/src/locales/en.json pnpm-lock.yaml
git commit -m "adminのi18n対応を追加"
```

### Task 10: Functions のロケール解決とエラー翻訳

**Files:**
- Modify: `apps/functions/src/api/types.ts`
- Create: `apps/functions/src/api/utils/locale.ts`
- Modify: `apps/functions/src/api/app.ts`
- Modify: `apps/functions/src/api/utils/response.ts`
- Modify: `packages/shared/src/locales/ja.json`
- Modify: `packages/shared/src/locales/en.json`

**Step 1: ロケール解決ユーティリティを作成**

```ts
// apps/functions/src/api/utils/locale.ts
import { normalizeLocale, type SupportedLocale } from "@kototsute/shared";

export const resolveLocaleFromHeader = (value: string | null | undefined): SupportedLocale => {
  const normalized = normalizeLocale(value);
  return normalized ?? "ja";
};
```

**Step 2: Context に locale を追加**

```ts
// apps/functions/src/api/types.ts
Variables: {
  auth: AuthState;
  deps: ApiDeps;
  locale: SupportedLocale;
};
```

**Step 3: app ミドルウェアに locale をセット**

```ts
// apps/functions/src/api/app.ts
app.use("*", async (c, next) => {
  const headerLocale = c.req.header("X-Locale") ?? c.req.header("Accept-Language");
  c.set("locale", resolveLocaleFromHeader(headerLocale));
  await next();
});
```

**Step 4: jsonError を i18n 対応**

```ts
// apps/functions/src/api/utils/response.ts
import { t } from "@kototsute/shared";
export const jsonError = (c, status, code, messageKey) => {
  const locale = c.get("locale");
  return c.json({ ok: false, code, message: t(messageKey, { locale }) }, status as any);
};
```

**Step 5: app.onError で key を使う**

```ts
if (err?.message === "UNAUTHORIZED") {
  return jsonError(c, 401, "UNAUTHORIZED", "errors.UNAUTHORIZED");
}
if (err instanceof DomainError) {
  return jsonError(c, 400, err.code, `errors.${err.code}`);
}
if (err instanceof HTTPException) {
  return err.getResponse();
}
return jsonError(c, 500, "INTERNAL_ERROR", "errors.INTERNAL_ERROR");
```

```ts
// app.notFound
return jsonError(c, 404, "NOT_FOUND", "errors.NOT_FOUND");
```

**Step 6: 翻訳キー追加**

```json
// packages/shared/src/locales/ja.json (追記)
{
  "errors": {
    "NOT_FOUND": "見つかりませんでした"
  }
}
```

**Step 7: コミット**

```bash
git add apps/functions/src/api/types.ts apps/functions/src/api/utils/locale.ts \
  apps/functions/src/api/app.ts apps/functions/src/api/utils/response.ts \
  packages/shared/src/locales/ja.json packages/shared/src/locales/en.json
git commit -m "functionsのロケール対応を追加"
```

### Task 11: Functions のバリデーション/通知文言を翻訳対応

**Files:**
- Modify: `apps/functions/src/api/routes/invites.ts`
- Modify: `apps/functions/src/api/routes/cases.ts`
- Modify: `apps/functions/src/api/routes/plans.ts`
- Modify: `apps/functions/src/api/routes/notifications.ts`
- Modify: `packages/shared/src/locales/ja.json`
- Modify: `packages/shared/src/locales/en.json`

**Step 1: バリデーションエラーを key で返す**

```ts
// invites.ts (例)
if (!parsed.success) {
  return jsonError(c, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "errors.VALIDATION_ERROR");
}
```

**Step 2: 通知文言を `t()` で生成**

```ts
import { t } from "@kototsute/shared";
const locale = c.get("locale");
const resolveUserLocale = async (uid: string) => {
  const snap = await getFirestore().collection("profiles").doc(uid).get();
  return (snap.data()?.locale as SupportedLocale | undefined) ?? locale;
};
const receiverLocale = await resolveUserLocale(receiverUid);
await notificationRef.set({
  title: t("notifications.invite.title", { locale: receiverLocale }),
  body: t("notifications.invite.body", { locale: receiverLocale }),
  ...
});
```

**Step 3: 翻訳キー追加**

```json
// packages/shared/src/locales/ja.json (追記)
{
  "notifications": {
    "invite": {
      "title": "相続人招待が届きました",
      "body": "相続人招待を受け取りました。"
    }
  }
}
```

```json
// packages/shared/src/locales/en.json (追記)
{
  "notifications": {
    "invite": {
      "title": "You have a new heir invitation",
      "body": "An heir invitation has been received."
    }
  }
}
```

**Step 4: Functions ビルド**

Run: `task functions:build`  
Expected: build success

**Step 5: コミット**

```bash
git add apps/functions/src/api/routes/invites.ts apps/functions/src/api/routes/cases.ts \
  apps/functions/src/api/routes/plans.ts apps/functions/src/api/routes/notifications.ts \
  packages/shared/src/locales/ja.json packages/shared/src/locales/en.json
git commit -m "functions文言を翻訳対応"
```

### Task 12: テストと最終確認

**Files:**
- Modify: `apps/functions/src/api/handler.test.ts` (必要に応じて)
- Modify: `apps/functions/src/api/app.test.ts` (必要に応じて)
- Modify: `apps/web/src/**/*.test.ts` (必要に応じて)
- Modify: `apps/admin/src/**/*.test.ts` (必要に応じて)

**Step 1: 変更に合わせてテストを更新**

例:
```ts
expect(body).toEqual({ ok: false, code: "NOT_FOUND", message: "見つかりませんでした" });
```

**Step 2: テスト実行**

Run: `pnpm -C packages/shared test`  
Expected: PASS

Run: `pnpm -C apps/web test`  
Expected: PASS

Run: `pnpm -C apps/admin test`  
Expected: PASS

Run: `pnpm -C apps/functions test`  
Expected: PASS

**Step 3: 最終コミット**

```bash
git add apps/functions/src/api/handler.test.ts apps/functions/src/api/app.test.ts \
  apps/web/src apps/admin/src
git commit -m "i18nテストを更新"
```

---

Plan complete and saved to `docs/plans/2026-02-03-localization-implementation-plan.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
