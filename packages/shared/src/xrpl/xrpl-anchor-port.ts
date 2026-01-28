import { Hash } from "../value/hash.js";
import { TxId } from "../value/tx-id.js";

export interface XrplAnchorPort {
  anchorPlanHash(planId: string, hash: Hash): Promise<TxId>;
  anchorDeathAttestationHash(attestationId: string, hash: Hash): Promise<TxId>;
}
