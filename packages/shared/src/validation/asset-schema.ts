import { z } from "zod";
import { isXrpAddress } from "./xrp-address";

export const assetCreateSchema = z.object({
  label: z.string().min(1, "ラベルは必須です"),
  address: z
    .string()
    .min(1, "アドレスは必須です")
    .refine((value) => isXrpAddress(value), "XRPアドレスが不正です")
});
