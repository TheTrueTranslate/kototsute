import { normalizeLocale, setLocale, type SupportedLocale } from "@kototsute/shared";
import { useTranslation } from "react-i18next";
import { useLocaleOptional } from "../providers/LocaleProvider";
import { Button, type ButtonProps } from "./ui/button";
import styles from "./locale-switcher.module.css";

type LocaleSwitcherProps = {
  jaLabel: string;
  enLabel: string;
  label?: string;
  ariaLabel?: string;
  className?: string;
  labelClassName?: string;
  actionsClassName?: string;
  buttonSize?: ButtonProps["size"];
};

export default function LocaleSwitcher({
  jaLabel,
  enLabel,
  label,
  ariaLabel,
  className,
  labelClassName,
  actionsClassName,
  buttonSize = "sm"
}: LocaleSwitcherProps) {
  const { i18n } = useTranslation();
  const localeContext = useLocaleOptional();
  const locale =
    localeContext?.locale ?? normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? "ja";

  const wrapperClasses = [styles.switcher, className].filter(Boolean).join(" ");
  const labelClasses = [styles.label, labelClassName].filter(Boolean).join(" ");
  const actionClasses = [styles.actions, actionsClassName].filter(Boolean).join(" ");
  const groupAriaLabel = ariaLabel ?? label;

  const onChangeLocale = async (next: SupportedLocale) => {
    if (next === locale) return;
    if (localeContext) {
      await localeContext.updateLocale(next);
      return;
    }
    await setLocale(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("locale", next);
    }
  };

  return (
    <div className={wrapperClasses}>
      {label ? <p className={labelClasses}>{label}</p> : null}
      <div className={actionClasses} role="group" aria-label={groupAriaLabel}>
        <Button
          type="button"
          size={buttonSize}
          variant={locale === "ja" ? "default" : "outline"}
          onClick={() => void onChangeLocale("ja")}
          disabled={localeContext?.loading}
        >
          {jaLabel}
        </Button>
        <Button
          type="button"
          size={buttonSize}
          variant={locale === "en" ? "default" : "outline"}
          onClick={() => void onChangeLocale("en")}
          disabled={localeContext?.loading}
        >
          {enLabel}
        </Button>
      </div>
    </div>
  );
}
