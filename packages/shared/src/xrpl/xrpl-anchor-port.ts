import { Hash } from "../value/hash";
import { TxId } from "../value/tx-id";

export interface XrplAnchorPort {
  anchorPlanHash(planId: string, hash: Hash): Promise<TxId>;
  anchorDeathAttestationHash(attestationId: string, hash: Hash): Promise<TxId>;
}
