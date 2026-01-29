import crypto from "node:crypto";

export type XrplToken = {
  currency: string;
  issuer: string | null;
  isNative: boolean;
};

export type XrplStatus =
  | { status: "ok"; balanceXrp: string; ledgerIndex?: number; tokens?: XrplToken[] }
  | { status: "error"; message: string };

export const XRPL_URL = process.env.XRPL_URL ?? "https://s.altnet.rippletest.net:51234";
export const XRPL_VERIFY_ADDRESS =
  process.env.XRPL_VERIFY_ADDRESS ?? "rp7W5EetJmFuACL7tT1RJNoLE4S92Pg1JS";

const formatXrp = (drops: string): string => {
  const value = Number(drops) / 1_000_000;
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(6).replace(/\.0+$/, "").replace(/\.(\d*?)0+$/, ".$1");
};

export const fetchXrplAccountInfo = async (address: string): Promise<XrplStatus> => {
  try {
    const res = await fetch(XRPL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "account_info",
        params: [{ account: address, strict: true, ledger_index: "validated" }]
      })
    });

    const payload = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return { status: "error", message: payload?.error_message ?? "XRPL request failed" };
    }
    if (payload?.result?.error) {
      return {
        status: "error",
        message: payload?.result?.error_message ?? payload?.result?.error ?? "XRPL error"
      };
    }
    const balanceDrops = payload?.result?.account_data?.Balance;
    const ledgerIndex = payload?.result?.ledger_index;
    if (typeof balanceDrops !== "string") {
      return { status: "error", message: "XRPL balance is unavailable" };
    }
    return { status: "ok", balanceXrp: formatXrp(balanceDrops), ledgerIndex };
  } catch (error: any) {
    return { status: "error", message: error?.message ?? "XRPL request failed" };
  }
};

export const fetchXrplAccountLines = async (
  address: string
): Promise<{ status: "ok"; tokens: XrplToken[] } | { status: "error"; message: string }> => {
  try {
    const res = await fetch(XRPL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "account_lines",
        params: [{ account: address, ledger_index: "validated" }]
      })
    });

    const payload = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || payload?.result?.error) {
      return {
        status: "error",
        message: payload?.result?.error_message ?? payload?.error_message ?? "XRPL error"
      };
    }

    const lines = Array.isArray(payload?.result?.lines) ? payload.result.lines : [];
    const tokens = lines.map((line: any) => ({
      currency: String(line.currency ?? ""),
      issuer: typeof line.account === "string" ? line.account : null,
      isNative: false
    }));
    return { status: "ok", tokens };
  } catch (error: any) {
    return { status: "error", message: error?.message ?? "XRPL request failed" };
  }
};

export const createChallenge = () => crypto.randomBytes(8).toString("hex");

export const decodeHex = (value?: string) => {
  if (!value) return "";
  try {
    return Buffer.from(value, "hex").toString("utf8");
  } catch {
    return "";
  }
};

export const fetchXrplTx = async (txHash: string) => {
  const res = await fetch(XRPL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "tx",
      params: [{ transaction: txHash, binary: false }]
    })
  });
  const payload = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || payload?.result?.error) {
    return {
      ok: false,
      message: payload?.result?.error_message ?? payload?.error_message ?? "XRPL tx not found"
    };
  }
  return { ok: true, tx: payload?.result };
};
