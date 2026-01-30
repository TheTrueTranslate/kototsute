import { z } from "zod";
import { isXrpAddress } from "./xrp-address.js";

export const assetCreateSchema = z.object({
  label: z.string().min(1, "ラベルは必須です"),
  address: z
    .string()
    .min(1, "アドレスは必須です")
    .refine((value) => isXrpAddress(value), "XRPアドレスが不正です")
});

const numericStringSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "数値で入力してください");

export const assetReserveSchema = z
  .object({
    reserveXrp: numericStringSchema,
    reserveTokens: z.array(
      z.object({
        currency: z.string().min(1, "通貨コードは必須です"),
        issuer: z.string().nullable(),
        reserveAmount: numericStringSchema
      })
    )
  })
  .refine((value) => {
    const keys = value.reserveTokens.map(
      (token) => `${token.currency}::${token.issuer ?? ""}`
    );
    return new Set(keys).size === keys.length;
  }, "同じトークンは1度だけ指定できます");
