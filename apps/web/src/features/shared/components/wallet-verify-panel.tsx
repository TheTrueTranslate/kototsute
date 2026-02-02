import FormField from "./form-field";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import styles from "./wallet-verify-panel.module.css";

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
  return (
    <div className={styles.panel} data-testid="wallet-verify-panel">
      <div className={styles.block}>
        <div className={styles.row}>
          <div>
            <div className={styles.label}>Destination（運営確認用ウォレット）</div>
            <div className={styles.value}>{destination}</div>
          </div>
        </div>
        <div className={styles.hint}>送金先はシステムの検証用アドレスです。</div>
        <div className={styles.row}>
          <div>
            <div className={styles.label}>Memo</div>
            <div className={styles.value}>{memo}</div>
          </div>
        </div>
        <div className={styles.hint}>1 drops (=0.000001 XRP) を送信します。</div>
      </div>

      <FormField label="シークレット">
        <Input
          type="password"
          value={secret}
          onChange={(event) => onSecretChange(event.target.value)}
          placeholder="s..."
          disabled={secretDisabled}
        />
      </FormField>
      <div className={styles.hint}>シークレットは一時的に利用し、保存しません。</div>
      <div className={styles.actions}>
        <Button size="sm" onClick={onSubmit} disabled={submitDisabled}>
          {isSubmitting ? "自動検証中..." : "シークレットで自動検証"}
        </Button>
      </div>
    </div>
  );
};
