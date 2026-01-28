import { apiFetch } from "../../lib/api";

export type InviteStatus = "pending" | "accepted" | "declined";

export type InviteListItem = {
  inviteId: string;
  ownerUid: string;
  email: string;
  status: InviteStatus;
  relationLabel: string;
  relationOther: string | null;
  memo: string | null;
  isExistingUserAtInvite: boolean;
  acceptedByUid: string | null;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
};

export type InviteCreateInput = {
  email: string;
  relationLabel: string;
  relationOther?: string;
  memo?: string;
};

export const createInvite = async (input: InviteCreateInput) => {
  const result = await apiFetch("/v1/invites", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return result.data as { inviteId: string };
};

export const listInvitesByOwner = async () => {
  const result = await apiFetch("/v1/invites?scope=owner", { method: "GET" });
  return result.data as InviteListItem[];
};

export const listInvitesReceived = async () => {
  const result = await apiFetch("/v1/invites?scope=received", { method: "GET" });
  return result.data as InviteListItem[];
};

export const acceptInvite = async (inviteId: string) => {
  await apiFetch(`/v1/invites/${inviteId}/accept`, { method: "POST" });
};

export const declineInvite = async (inviteId: string) => {
  await apiFetch(`/v1/invites/${inviteId}/decline`, { method: "POST" });
};
