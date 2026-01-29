import type { CaseRecord, CaseRepository } from "@kototsute/case";

export class InMemoryCaseRepository implements CaseRepository {
  private records = new Map<string, CaseRecord>();
  private ownerIndex = new Map<string, string>();
  private memberIndex = new Map<string, Set<string>>();

  async createCase(input: { ownerUid: string; ownerDisplayName: string }): Promise<CaseRecord> {
    const now = new Date();
    const caseId = `case-${this.records.size + 1}`;
    const record: CaseRecord = {
      caseId,
      ownerUid: input.ownerUid,
      ownerDisplayName: input.ownerDisplayName,
      stage: "DRAFT",
      assetLockStatus: "UNLOCKED",
      createdAt: now,
      updatedAt: now
    };
    this.records.set(caseId, record);
    this.ownerIndex.set(input.ownerUid, caseId);
    const members = this.memberIndex.get(input.ownerUid) ?? new Set<string>();
    members.add(caseId);
    this.memberIndex.set(input.ownerUid, members);
    return record;
  }

  async getCaseByOwnerUid(ownerUid: string): Promise<CaseRecord | null> {
    const caseId = this.ownerIndex.get(ownerUid);
    if (!caseId) {
      return null;
    }
    return this.records.get(caseId) ?? null;
  }

  async listCasesByMemberUid(uid: string): Promise<CaseRecord[]> {
    const caseIds = Array.from(this.memberIndex.get(uid) ?? []);
    return caseIds.map((caseId) => this.records.get(caseId)).filter(Boolean) as CaseRecord[];
  }
}
