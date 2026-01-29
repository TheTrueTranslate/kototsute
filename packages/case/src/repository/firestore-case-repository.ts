import { getFirestore } from "firebase-admin/firestore";
import type { CaseRecord, CaseRepository } from "./case-repository.js";

const mapCaseRecord = (data: Record<string, any>, id: string): CaseRecord => {
  const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
  const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt;
  return {
    caseId: data.caseId ?? id,
    ownerUid: data.ownerUid,
    ownerDisplayName: data.ownerDisplayName,
    stage: data.stage,
    assetLockStatus: data.assetLockStatus,
    createdAt: createdAt ?? new Date(0),
    updatedAt: updatedAt ?? new Date(0)
  };
};

export class FirestoreCaseRepository implements CaseRepository {
  async createCase(input: { ownerUid: string; ownerDisplayName: string }): Promise<CaseRecord> {
    const now = new Date();
    const doc = getFirestore().collection("cases").doc();
    const record: CaseRecord = {
      caseId: doc.id,
      ownerUid: input.ownerUid,
      ownerDisplayName: input.ownerDisplayName,
      stage: "DRAFT",
      assetLockStatus: "UNLOCKED",
      createdAt: now,
      updatedAt: now
    };

    await doc.set({
      ...record,
      memberUids: [input.ownerUid]
    });

    return record;
  }

  async getCaseByOwnerUid(ownerUid: string): Promise<CaseRecord | null> {
    const snapshot = await getFirestore()
      .collection("cases")
      .where("ownerUid", "==", ownerUid)
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    if (!doc) {
      return null;
    }
    return mapCaseRecord(doc.data() ?? {}, doc.id);
  }

  async listCasesByMemberUid(uid: string): Promise<CaseRecord[]> {
    const snapshot = await getFirestore()
      .collection("cases")
      .where("memberUids", "array-contains", uid)
      .get();
    return snapshot.docs.map((doc) => mapCaseRecord(doc.data() ?? {}, doc.id));
  }
}
