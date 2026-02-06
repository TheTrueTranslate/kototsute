import { useEffect, useState } from "react";
import { signOut, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { displayNameSchema } from "@kototsute/shared";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../features/auth/auth-provider";
import FormAlert from "../../features/shared/components/form-alert";
import LocaleSwitcher from "../../features/shared/components/locale-switcher";
import { Button } from "../../features/shared/components/ui/button";
import { Input } from "../../features/shared/components/ui/input";
import { auth, db } from "../../features/shared/lib/firebase";
import styles from "../../styles/myPage.module.css";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "../../features/shared/components/ui/dialog";

type FormStatus = {
  type: "success" | "error";
  message: string;
};

export default function MyPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [lastSavedName, setLastSavedName] = useState(user?.displayName ?? "");
  const [status, setStatus] = useState<FormStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
    setLastSavedName(user?.displayName ?? "");
  }, [user?.displayName]);

  const saveDisplayName = async () => {
    setStatus(null);
    const parsed = displayNameSchema.safeParse(displayName);
    if (!parsed.success) {
      setStatus({
        type: "error",
        message: t(parsed.error.issues[0]?.message ?? "errors.VALIDATION_ERROR")
      });
      return;
    }
    if (!auth.currentUser) {
      setStatus({
        type: "error",
        message: t("myPage.error.authMissing")
      });
      return;
    }
    if (parsed.data === lastSavedName) {
      return;
    }
    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: parsed.data });
      await setDoc(
        doc(db, "profiles", auth.currentUser.uid),
        {
          uid: auth.currentUser.uid,
          displayName: parsed.data,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      setLastSavedName(parsed.data);
      setStatus({ type: "success", message: t("myPage.status.displayNameUpdated") });
    } catch (err: any) {
      setStatus({
        type: "error",
        message: err?.message ?? t("myPage.error.displayNameUpdateFailed")
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await signOut(auth);
      navigate("/login");
      return true;
    } catch (err: any) {
      setLogoutError(err?.message ?? t("myPage.error.logoutFailed"));
      return false;
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className="text-title">{t("myPage.title")}</h1>
        <p className={styles.lead}>{t("myPage.lead")}</p>
      </header>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t("myPage.section.account")}</div>
        <div className={styles.card}>
          {status ? <FormAlert variant={status.type}>{status.message}</FormAlert> : null}
          <div className={styles.row}>
            <span className={styles.label}>{t("myPage.labels.email")}</span>
            <span className={styles.value}>{user?.email ?? t("common.unset")}</span>
          </div>
          <form
            className={styles.row}
            onSubmit={(event) => {
              event.preventDefault();
              void saveDisplayName();
            }}
          >
            <span className={styles.label}>{t("myPage.labels.displayName")}</span>
            <div className={styles.editRow}>
              <div className={styles.editField}>
                <Input
                  aria-label={t("myPage.labels.displayName")}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={t("myPage.placeholders.displayName")}
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={saving || !displayName.trim() || displayName.trim() === lastSavedName.trim()}
              >
                {saving ? t("myPage.actions.updating") : t("myPage.actions.update")}
              </Button>
            </div>
          </form>
          <div className={styles.row}>
            <span className={styles.label}>{t("myPage.language.label")}</span>
            <LocaleSwitcher
              ariaLabel={t("myPage.language.label")}
              jaLabel={t("myPage.language.ja")}
              enLabel={t("myPage.language.en")}
            />
          </div>
          <div className={styles.row}>
            <span className={styles.label}>{t("myPage.labels.uid")}</span>
            <span className={styles.valueMono}>{user?.uid ?? "-"}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>{t("myPage.labels.logout")}</span>
            <div className={styles.actionsInline}>
              <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline">
                    {t("myPage.logout.confirm")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("myPage.logout.title")}</DialogTitle>
                    <DialogDescription>{t("myPage.logout.description")}</DialogDescription>
                  </DialogHeader>
                  {logoutError ? <FormAlert variant="error">{logoutError}</FormAlert> : null}
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline">
                        {t("myPage.logout.cancel")}
                      </Button>
                    </DialogClose>
                    <Button
                      type="button"
                      onClick={async () => {
                        const ok = await handleLogout();
                        if (ok) {
                          setLogoutOpen(false);
                        }
                      }}
                    >
                      {t("myPage.logout.confirm")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
