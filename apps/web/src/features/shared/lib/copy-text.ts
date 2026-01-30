export type CopyResult = {
  ok: boolean;
  message: string;
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
    return { ok: false, message: "コピーできる値がありません" };
  }
  try {
    const target = clipboard ?? (typeof navigator !== "undefined" ? navigator.clipboard : undefined);
    if (target?.writeText) {
      await target.writeText(value);
    }
    return { ok: true, message: `${label}をコピーしました` };
  } catch {
    return { ok: false, message: "コピーに失敗しました" };
  }
};
