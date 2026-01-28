import { DomainError } from "../error/domain-error";
import { Hash } from "../value/hash";
import { TxId } from "../value/tx-id";
import { XrplAnchorPort } from "./xrpl-anchor-port";

export class XrplAnchorStub implements XrplAnchorPort {
  async anchorPlanHash(_planId: string, _hash: Hash): Promise<TxId> {
    throw new DomainError("XRPL_NOT_IMPLEMENTED", "XRPL anchor is not implemented yet");
  }

  async anchorDeathAttestationHash(_attestationId: string, _hash: Hash): Promise<TxId> {
    throw new DomainError("XRPL_NOT_IMPLEMENTED", "XRPL anchor is not implemented yet");
  }
}
