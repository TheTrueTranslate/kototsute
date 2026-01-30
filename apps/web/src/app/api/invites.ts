import { apiFetch } from "../../features/shared/lib/api";

export type InviteStatus = "pending" | "accepted" | "declined";

export type InviteListItem = {
  inviteId: string;
  caseId: string;
  ownerUid: string;
  ownerDisplayName?: string | null;
  caseOwnerDisplayName?: string | null;
  email: string;
  status: InviteStatus;
  relationLabel: string;
  relationOther: string | null;
  memo: string | null;
  acceptedByUid: string | null;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
};

export type CaseHeir = {
  inviteId: string;
  email: string;
  relationLabel: string;
  relationOther: string | null;
  acceptedByUid: string | null;
  acceptedAt: string | null;
  walletStatus?: "UNREGISTERED" | "PENDING" | "VERIFIED";
};

export type InviteCreateInput = {
  email: string;
  relationLabel: string;
  relationOther?: string;
  memo?: string;
};

export const createInvite = async (caseId: string, input: InviteCreateInput) => {
  const result = await apiFetch(`/v1/cases/${caseId}/invites`, {
    method: "POST",
    body: JSON.stringify(input)
  });
  return result.data as { inviteId: string };
};

export const listInvitesByOwner = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/invites?scope=owner`, { method: "GET" });
  return result.data as InviteListItem[];
};

export const listInvitesReceived = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/invites?scope=received`, { method: "GET" });
  return result.data as InviteListItem[];
};

export const listInvitesReceivedAll = async () => {
  const result = await apiFetch(`/v1/cases/invites?scope=received`, { method: "GET" });
  return result.data as InviteListItem[];
};

export const acceptInvite = async (caseId: string, inviteId: string) => {
  await apiFetch(`/v1/cases/${caseId}/invites/${inviteId}/accept`, { method: "POST" });
};

export const declineInvite = async (caseId: string, inviteId: string) => {
  await apiFetch(`/v1/cases/${caseId}/invites/${inviteId}/decline`, { method: "POST" });
};

export const listCaseHeirs = async (caseId: string) => {
  const result = await apiFetch(`/v1/cases/${caseId}/heirs`, { method: "GET" });
  return result.data as CaseHeir[];
};

export const deleteInvite = async (_caseId: string, _inviteId: string) => {};
