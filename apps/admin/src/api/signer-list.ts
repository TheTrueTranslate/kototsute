import { apiFetch } from "../lib/api";

export const prepareApprovalTx = async (caseId: string) => {
  const result = await apiFetch(`/v1/admin/cases/${caseId}/signer-list/prepare`, {
    method: "POST"
  });
  return result.data as {
    memo: string;
    fromAddress: string;
    destination: string;
    amountDrops: string;
  };
};
