import FormField from "./form-field";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import styles from "./wallet-verify-panel.module.css";
import { useTranslation } from "react-i18next";

type WalletVerifyPanelProps = {
  destination: string;
  memo: string;
  secret: string;
  onSecretChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitDisabled: boolean;
  secretDisabled: boolean;
};

export const WalletVerifyPanel = ({
  destination,
  memo,
  secret,
  onSecretChange,
  onSubmit,
  isSubmitting,
  submitDisabled,
  secretDisabled
}: WalletVerifyPanelProps) => {
  const { t } = useTranslation();
  return (
    <div className={styles.panel} data-testid="wallet-verify-panel">
      <div className={styles.block}>
        <div className={styles.row}>
          <div>
            <div className={styles.label}>{t("walletVerify.destination.label")}</div>
            <div className={styles.value}>{destination}</div>
          </div>
        </div>
        <div className={styles.hint}>{t("walletVerify.destination.hint")}</div>
        <div className={styles.row}>
          <div>
            <div className={styles.label}>{t("walletVerify.memo.label")}</div>
            <div className={styles.value}>{memo}</div>
          </div>
        </div>
        <div className={styles.hint}>{t("walletVerify.memo.hint")}</div>
      </div>

      <FormField label={t("walletVerify.secret.label")}>
        <Input
          type="password"
          value={secret}
          onChange={(event) => onSecretChange(event.target.value)}
          placeholder="s..."
          disabled={secretDisabled}
        />
      </FormField>
      <div className={styles.hint}>{t("walletVerify.secret.hint")}</div>
      <div className={styles.actions}>
        <Button size="sm" onClick={onSubmit} disabled={submitDisabled}>
          {isSubmitting
            ? t("walletVerify.secret.submitting")
            : t("walletVerify.secret.submit")}
        </Button>
      </div>
    </div>
  );
};
