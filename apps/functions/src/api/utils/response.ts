import type { Context } from "hono";
import type { ApiBindings } from "../types";

export const jsonOk = <T>(c: Context<ApiBindings>, data?: T, status = 200) => {
  if (data === undefined) return c.json({ ok: true }, status);
  return c.json({ ok: true, data }, status);
};

export const jsonError = (
  c: Context<ApiBindings>,
  status: number,
  code: string,
  message: string
) => {
  return c.json({ ok: false, code, message }, status);
};
