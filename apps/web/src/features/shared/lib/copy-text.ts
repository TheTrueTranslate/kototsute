export type CopyResult = {
  ok: boolean;
  messageKey: string;
  values?: Record<string, string>;
};

type ClipboardLike = {
  writeText?: (value: string) => Promise<void>;
};

export const copyText = async (
  label: string,
  value: string,
  clipboard?: ClipboardLike
): Promise<CopyResult> => {
  if (!value) {
    return { ok: false, messageKey: "common.copy.empty" };
  }
  try {
    const target = clipboard ?? (typeof navigator !== "undefined" ? navigator.clipboard : undefined);
    if (target?.writeText) {
      await target.writeText(value);
    }
    return { ok: true, messageKey: "common.copy.success", values: { label } };
  } catch {
    return { ok: false, messageKey: "common.copy.failed" };
  }
};
