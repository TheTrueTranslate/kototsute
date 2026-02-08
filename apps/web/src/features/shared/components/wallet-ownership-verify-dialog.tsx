import FormAlert from "./form-alert";
import FormField from "./form-field";
import { WalletVerifyPanel } from "./wallet-verify-panel";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./ui/dialog";
import { Input } from "./ui/input";

type WalletOwnershipVerifyDialogAlert = {
  variant: "error" | "success" | "info";
  message: string;
};

type WalletOwnershipVerifyAddressForm = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isSaving?: boolean;
  saveLabel?: string;
  savingLabel?: string;
  onSave?: () => void;
  saveDisabled?: boolean;
  startVerifyLabel?: string;
  onStartVerify?: () => void;
  startVerifyDisabled?: boolean;
};

type WalletOwnershipVerifyDialogClassNames = {
  form?: string;
  actions?: string;
  verifyBox?: string;
  emptyState?: string;
  emptyTitle?: string;
  emptyBody?: string;
};

type WalletOwnershipVerifyPanelProps = {
  destination: string;
  memo: string;
  secret: string;
  onSecretChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitDisabled: boolean;
  secretDisabled: boolean;
  verifiedTxHash?: string | null;
};

type WalletOwnershipVerifyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  closeLabel: string;
  alerts?: WalletOwnershipVerifyDialogAlert[];
  addressForm?: WalletOwnershipVerifyAddressForm;
  showVerifyPanel: boolean;
  verifyPanel: WalletOwnershipVerifyPanelProps;
  emptyState?: {
    show: boolean;
    title: string;
    body: string;
  };
  classNames?: WalletOwnershipVerifyDialogClassNames;
};

export const WalletOwnershipVerifyDialog = ({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  alerts = [],
  addressForm,
  showVerifyPanel,
  verifyPanel,
  emptyState,
  classNames
}: WalletOwnershipVerifyDialogProps) => {
  const formClassName = classNames?.form ?? "grid gap-2";
  const actionsClassName = classNames?.actions ?? "flex flex-wrap items-center gap-2";
  const verifyBoxClassName = classNames?.verifyBox ?? "grid gap-2";
  const emptyStateClassName =
    classNames?.emptyState ?? "rounded-xl border border-border/60 bg-muted/30 px-4 py-4";
  const emptyTitleClassName = classNames?.emptyTitle ?? "text-body font-medium text-foreground";
  const emptyBodyClassName = classNames?.emptyBody ?? "mt-1 text-body-sm text-muted-foreground";

  const validAlerts = alerts
    .map((alert) => ({ ...alert, message: alert.message.trim() }))
    .filter((alert) => alert.message.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="wallet-ownership-verify-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {validAlerts.map((alert, index) => (
          <FormAlert key={`${alert.variant}-${index}`} variant={alert.variant}>
            {alert.message}
          </FormAlert>
        ))}
        {addressForm ? (
          <div className={formClassName}>
            <FormField label={addressForm.label}>
              <Input
                value={addressForm.value}
                onChange={(event) => addressForm.onChange(event.target.value)}
                placeholder={addressForm.placeholder}
              />
            </FormField>
            {addressForm.onSave && addressForm.saveLabel && addressForm.savingLabel ? (
              <div className={actionsClassName}>
                <Button
                  type="button"
                  onClick={addressForm.onSave}
                  disabled={Boolean(addressForm.saveDisabled)}
                >
                  {addressForm.isSaving ? addressForm.savingLabel : addressForm.saveLabel}
                </Button>
                {addressForm.onStartVerify && addressForm.startVerifyLabel ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addressForm.onStartVerify}
                    disabled={Boolean(addressForm.startVerifyDisabled)}
                  >
                    {addressForm.startVerifyLabel}
                  </Button>
                ) : null}
              </div>
            ) : addressForm.onStartVerify && addressForm.startVerifyLabel ? (
              <div className={actionsClassName}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addressForm.onStartVerify}
                  disabled={Boolean(addressForm.startVerifyDisabled)}
                >
                  {addressForm.startVerifyLabel}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {showVerifyPanel ? (
          <div className={verifyBoxClassName}>
            <WalletVerifyPanel
              destination={verifyPanel.destination}
              memo={verifyPanel.memo}
              secret={verifyPanel.secret}
              onSecretChange={verifyPanel.onSecretChange}
              onSubmit={verifyPanel.onSubmit}
              isSubmitting={verifyPanel.isSubmitting}
              submitDisabled={verifyPanel.submitDisabled}
              secretDisabled={verifyPanel.secretDisabled}
              verifiedTxHash={verifyPanel.verifiedTxHash}
            />
          </div>
        ) : emptyState?.show ? (
          <div className={emptyStateClassName}>
            <div className={emptyTitleClassName}>{emptyState.title}</div>
            <div className={emptyBodyClassName}>{emptyState.body}</div>
          </div>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {closeLabel}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
