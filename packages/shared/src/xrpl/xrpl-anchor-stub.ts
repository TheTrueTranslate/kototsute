import { DomainError } from "../error/domain-error.js";
import { Hash } from "../value/hash.js";
import { TxId } from "../value/tx-id.js";
import { XrplAnchorPort } from "./xrpl-anchor-port.js";

export class XrplAnchorStub implements XrplAnchorPort {
  async anchorPlanHash(_planId: string, _hash: Hash): Promise<TxId> {
    throw new DomainError("XRPL_NOT_IMPLEMENTED", "XRPL anchor is not implemented yet");
  }

  async anchorDeathAttestationHash(_attestationId: string, _hash: Hash): Promise<TxId> {
    throw new DomainError("XRPL_NOT_IMPLEMENTED", "XRPL anchor is not implemented yet");
  }
}
