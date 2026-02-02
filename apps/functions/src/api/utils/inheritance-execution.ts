import type { DocumentReference } from "firebase-admin/firestore";
import { sendSignerListSet } from "@kototsute/shared";
import { decryptPayload } from "./encryption.js";
import { createChallenge, fetchXrplTx, fetchXrplValidatedLedgerIndex } from "./xrpl.js";
import { prepareApprovalTx, signForMultisign } from "./xrpl-multisign.js";

type PrepareApprovalSummary = {
  memo: string;
  fromAddress: string;
  destination: string;
  amountDrops: string;
};

export const removeUndefinedValues = (value: any): any => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => removeUndefinedValues(entry))
      .filter((entry) => entry !== undefined);
  }
  if (value && typeof value === "object") {
    return Object.entries(value).reduce<Record<string, any>>((acc, [key, entry]) => {
      if (entry === undefined) return acc;
      acc[key] = removeUndefinedValues(entry);
      return acc;
    }, {});
  }
  return value;
};

export type PrepareInheritanceResult =
  | { status: "PREPARED"; approvalTx: PrepareApprovalSummary }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; reason: string };

const resolveApprovalSummary = (
  txJson: any,
  memo: string | null | undefined,
  fallbackFrom: string
): PrepareApprovalSummary => {
  const fromAddress =
    typeof txJson?.Account === "string" ? txJson.Account : fallbackFrom;
  const destination = typeof txJson?.Destination === "string" ? txJson.Destination : "";
  const amountDrops =
    typeof txJson?.Amount === "string" ? txJson.Amount : "1";
  return {
    memo: memo ?? "",
    fromAddress,
    destination,
    amountDrops
  };
};

export const prepareInheritanceExecution = async (input: {
  caseRef: DocumentReference;
  caseData: Record<string, any>;
  now: Date;
  force?: boolean;
}): Promise<PrepareInheritanceResult> => {
  const { caseRef, caseData, now, force } = input;
  if (caseData.stage !== "IN_PROGRESS") {
    return { status: "SKIPPED", reason: "NOT_IN_PROGRESS" };
  }

  const lockSnap = await caseRef.collection("assetLock").doc("state").get();
  const lockData = lockSnap.data() ?? {};
  const walletAddress = lockData?.wallet?.address;
  const seedEncrypted = lockData?.wallet?.seedEncrypted;
  if (!walletAddress || !seedEncrypted) {
    return { status: "SKIPPED", reason: "LOCK_WALLET_MISSING" };
  }

  const signerRef = caseRef.collection("signerList").doc("state");
  const signerSnap = await signerRef.get();
  const signerData = signerSnap.data() ?? {};
  const existingEntries = Array.isArray(signerData.entries) ? signerData.entries : [];
  let signerEntries = existingEntries;

  if (signerData.status !== "SET" || existingEntries.length === 0) {
    const memberUids = Array.isArray(caseData.memberUids) ? caseData.memberUids : [];
    const heirUids = memberUids.filter((uid) => uid !== caseData.ownerUid);
    const walletSnaps = await Promise.all(
      heirUids.map((uid) => caseRef.collection("heirWallets").doc(uid).get())
    );
    const heirWallets = walletSnaps.map((snap) => {
      const data = snap.data() ?? {};
      const address = typeof data.address === "string" ? data.address : "";
      const verified = data.verificationStatus === "VERIFIED" && address.length > 0;
      return { address, verified };
    });
    const hasUnverified = heirWallets.some((wallet) => !wallet.verified);
    if (hasUnverified) {
      return { status: "SKIPPED", reason: "HEIR_WALLET_UNVERIFIED" };
    }

    const systemSigner = process.env.XRPL_SYSTEM_SIGNER_ADDRESS ?? "";
    if (!systemSigner) {
      return { status: "FAILED", reason: "SYSTEM_SIGNER_MISSING" };
    }
    const heirAddresses = heirWallets
      .map((wallet) => wallet.address)
      .filter((address) => address);
    if (heirAddresses.length === 0) {
      return { status: "SKIPPED", reason: "HEIR_MISSING" };
    }
    const quorum = heirAddresses.length + (Math.floor(heirAddresses.length / 2) + 1);
    signerEntries = [
      { account: systemSigner, weight: heirAddresses.length },
      ...heirAddresses.map((address) => ({ account: address, weight: 1 }))
    ];

    const seed = decryptPayload(seedEncrypted);
    try {
      await sendSignerListSet({
        fromSeed: seed,
        fromAddress: walletAddress,
        signerEntries,
        quorum
      });
      await signerRef.set(
        {
          status: "SET",
          quorum,
          entries: signerEntries,
          createdAt: signerData.createdAt ?? now,
          updatedAt: now
        },
        { merge: true }
      );
    } catch (error: any) {
      await signerRef.set(
        {
          status: "FAILED",
          quorum,
          entries: signerEntries,
          error: error?.message ?? "SignerListSet failed",
          createdAt: signerData.createdAt ?? now,
          updatedAt: now
        },
        { merge: true }
      );
      return { status: "FAILED", reason: "SIGNER_LIST_FAILED" };
    }
  }

  const approvalRef = caseRef.collection("signerList").doc("approvalTx");
  const approvalSnap = await approvalRef.get();
  const approvalData = approvalSnap.data() ?? {};
  const isAlreadyPrepared =
    approvalData.status === "PREPARED" || approvalData.status === "SUBMITTED";
  if (isAlreadyPrepared) {
    if (force && approvalData.status === "SUBMITTED") {
      const submittedHash =
        typeof approvalData.submittedTxHash === "string"
          ? approvalData.submittedTxHash
          : "";
      const isExpired = await (async () => {
        if (!submittedHash) return false;
        const txResult = await fetchXrplTx(submittedHash);
        if (!txResult.ok) return false;
        const tx = txResult.tx as any;
        if (tx?.validated) return false;
        const lastLedgerRaw = tx?.LastLedgerSequence;
        const lastLedger =
          typeof lastLedgerRaw === "number"
            ? lastLedgerRaw
            : typeof lastLedgerRaw === "string"
              ? Number(lastLedgerRaw)
              : NaN;
        if (!Number.isFinite(lastLedger)) return false;
        const ledgerResult = await fetchXrplValidatedLedgerIndex();
        if (!ledgerResult.ok) return false;
        return ledgerResult.ledgerIndex >= lastLedger;
      })();
      if (!isExpired) {
        return { status: "SKIPPED", reason: "APPROVAL_NOT_EXPIRED" };
      }
      const signaturesSnap = await signerRef.collection("signatures").get();
      await Promise.all(signaturesSnap.docs.map((doc) => doc.ref.delete()));
    } else {
      return {
        status: "PREPARED",
        approvalTx: resolveApprovalSummary(
          approvalData.txJson ?? {},
          approvalData.memo ?? "",
          walletAddress
        )
      };
    }
  }

  const systemSeed = process.env.XRPL_SYSTEM_SIGNER_SEED ?? "";
  if (!systemSeed) {
    return { status: "FAILED", reason: "SYSTEM_SIGNER_SEED_MISSING" };
  }
  const destination = process.env.XRPL_VERIFY_ADDRESS ?? "";
  if (!destination) {
    return { status: "FAILED", reason: "VERIFY_ADDRESS_MISSING" };
  }

  const memo = createChallenge();
  const memoHex = Buffer.from(memo, "utf8").toString("hex").toUpperCase();
  const signersCount = signerEntries.length || 1;
  const txJson = await prepareApprovalTx({
    fromAddress: walletAddress,
    destination,
    amountDrops: "1",
    memoHex,
    signersCount
  });
  const sanitizedTxJson = removeUndefinedValues(txJson);
  const systemSigned = signForMultisign(sanitizedTxJson, systemSeed);
  await approvalRef.set({
    memo,
    txJson: sanitizedTxJson,
    systemSignedBlob: systemSigned.blob,
    systemSignedHash: systemSigned.hash,
    status: "PREPARED",
    submittedTxHash: null,
    createdAt: force ? now : approvalData.createdAt ?? now,
    updatedAt: now
  });

  return {
    status: "PREPARED",
    approvalTx: {
      memo,
      fromAddress: walletAddress,
      destination,
      amountDrops: "1"
    }
  };
};
