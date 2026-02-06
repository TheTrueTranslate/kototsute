import { z } from "zod";
import { isXrpAddress } from "./xrp-address.js";

export const assetCreateSchema = z.object({
  label: z
    .string({ required_error: "validation.asset.label.required" })
    .min(1, "validation.asset.label.required"),
  address: z
    .string({ required_error: "validation.asset.address.required" })
    .min(1, "validation.asset.address.required")
    .refine((value) => isXrpAddress(value), "validation.asset.address.invalid")
});

export const assetLabelUpdateSchema = z.object({
  label: z
    .string({ required_error: "validation.asset.label.required" })
    .min(1, "validation.asset.label.required")
});

const numericStringSchema = z
  .string({ required_error: "validation.asset.numeric" })
  .regex(/^\d+(\.\d+)?$/, "validation.asset.numeric");

export const assetReserveSchema = z
  .object({
    reserveXrp: numericStringSchema,
    reserveTokens: z.array(
      z.object({
        currency: z
          .string({ required_error: "validation.asset.token.currency" })
          .min(1, "validation.asset.token.currency"),
        issuer: z.string().nullable(),
        reserveAmount: numericStringSchema
      })
    ),
    reserveNfts: z
      .array(
        z
          .string({ required_error: "validation.asset.nft.required" })
          .min(1, "validation.asset.nft.required")
      )
      .default([])
  })
  .superRefine((value, ctx) => {
    const keys = value.reserveTokens.map(
      (token) => `${token.currency}::${token.issuer ?? ""}`
    );
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reserveTokens"],
        message: "validation.asset.token.duplicate"
      });
    }
    if (new Set(value.reserveNfts).size !== value.reserveNfts.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reserveNfts"],
        message: "validation.asset.nft.duplicate"
      });
    }
  });
