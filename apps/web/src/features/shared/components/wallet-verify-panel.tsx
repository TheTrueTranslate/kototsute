import FormField from "./form-field";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import styles from "./wallet-verify-panel.module.css";
import { useTranslation } from "react-i18next";
import XrplExplorerLink from "./xrpl-explorer-link";

type WalletVerifyPanelProps = {
  destination: string;
  memo: string;
  secret: string;
  onSecretChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitDisabled: boolean;
  secretDisabled: boolean;
  verifiedTxHash?: string | null;
  showVerificationDetails?: boolean;
  verificationHint?: string | null;
};

export const WalletVerifyPanel = ({
  destination,
  memo,
  secret,
  onSecretChange,
  onSubmit,
  isSubmitting,
  submitDisabled,
  secretDisabled,
  verifiedTxHash,
  showVerificationDetails = true,
  verificationHint = null
}: WalletVerifyPanelProps) => {
  const { t } = useTranslation();
  const txHash = verifiedTxHash?.trim() || "";
  const normalizedVerificationHint = verificationHint?.trim() ?? "";
  return (
    <div className={styles.panel} data-testid="wallet-verify-panel">
      {showVerificationDetails ? (
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
          {txHash ? (
            <div className={styles.row}>
              <div>
                <div className={styles.label}>{t("walletVerify.txHash.label")}</div>
                <XrplExplorerLink value={txHash} resource="transaction" className={styles.value}>
                  {txHash}
                </XrplExplorerLink>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {!showVerificationDetails && normalizedVerificationHint ? (
        <div className={styles.hint}>{normalizedVerificationHint}</div>
      ) : null}
      {!showVerificationDetails && txHash ? (
        <div className={styles.row}>
          <div>
            <div className={styles.label}>{t("walletVerify.txHash.label")}</div>
            <XrplExplorerLink value={txHash} resource="transaction" className={styles.value}>
              {txHash}
            </XrplExplorerLink>
          </div>
        </div>
      ) : null}

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
