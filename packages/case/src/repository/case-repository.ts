export type CaseRecord = {
  caseId: string;
  ownerUid: string;
  ownerDisplayName: string;
  stage: "DRAFT" | "WAITING" | "IN_PROGRESS" | "COMPLETED";
  assetLockStatus: "UNLOCKED" | "LOCKED";
  createdAt: Date;
  updatedAt: Date;
};

export interface CaseRepository {
  createCase(input: { ownerUid: string; ownerDisplayName: string }): Promise<CaseRecord>;
  getCaseByOwnerUid(ownerUid: string): Promise<CaseRecord | null>;
  listCasesByMemberUid(uid: string): Promise<CaseRecord[]>;
}
