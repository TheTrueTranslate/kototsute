import { Hono } from "hono";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { inviteCreateSchema } from "@kototsute/shared";
import type { ApiBindings } from "../types";
import { jsonError, jsonOk } from "../utils/response";
import { normalizeEmail } from "../utils/email";
import { formatDate } from "../utils/date";

export const invitesRoutes = () => {
  const app = new Hono<ApiBindings>();

  app.post("/", async (c) => {
    const auth = c.get("auth");
    const body = await c.req.json().catch(() => ({}));
    const parsed = inviteCreateSchema.safeParse({
      email: body?.email,
      relationLabel: body?.relationLabel,
      relationOther: body?.relationOther,
      memo: body?.memo
    });
    if (!parsed.success) {
      return jsonError(c, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "入力が不正です");
    }

    const normalizedEmail = normalizeEmail(parsed.data.email);
    const now = c.get("deps").now();
    const db = getFirestore();

    const resolveInviteReceiver = async (): Promise<string | null> => {
      try {
        const user = await getAuth().getUserByEmail(normalizedEmail);
        return user.uid;
      } catch (error: any) {
        if (error?.code === "auth/user-not-found") return null;
        throw error;
      }
    };

    const existingSnapshot = await db
      .collection("invites")
      .where("ownerUid", "==", auth.uid)
      .where("email", "==", normalizedEmail)
      .get();
    const existingDoc = existingSnapshot.docs[0];
    if (existingDoc) {
      const existing = existingDoc.data();
      if (existing?.status === "declined") {
        await existingDoc.ref.set(
          {
            status: "pending",
            relationLabel: parsed.data.relationLabel,
            relationOther: parsed.data.relationOther?.trim() ?? null,
            memo: parsed.data.memo?.trim() ?? null,
            updatedAt: now,
            declinedAt: null
          },
          { merge: true }
        );
        const receiverUid = await resolveInviteReceiver();
        if (receiverUid) {
          const notificationRef = db.collection("notifications").doc();
          await notificationRef.set({
            receiverUid,
            type: "INVITE_SENT",
            title: "相続人招待が届きました",
            body: "相続人招待を受け取りました。",
            related: { kind: "invite", id: existingDoc.id },
            isRead: false,
            createdAt: now
          });
        }
        return jsonOk(c, { inviteId: existingDoc.id, status: "pending" });
      }
      return jsonError(c, 409, "CONFLICT", "このメールアドレスは既に招待済みです");
    }

    const receiverUid = await resolveInviteReceiver();
    const isExistingUserAtInvite = Boolean(receiverUid);

    const inviteRef = db.collection("invites").doc();
    await inviteRef.set({
      ownerUid: auth.uid,
      email: normalizedEmail,
      status: "pending",
      relationLabel: parsed.data.relationLabel,
      relationOther: parsed.data.relationOther?.trim() ?? null,
      memo: parsed.data.memo?.trim() ?? null,
      isExistingUserAtInvite,
      acceptedByUid: null,
      acceptedAt: null,
      declinedAt: null,
      createdAt: now,
      updatedAt: now
    });

    if (receiverUid) {
      const notificationRef = db.collection("notifications").doc();
      await notificationRef.set({
        receiverUid,
        type: "INVITE_SENT",
        title: "相続人招待が届きました",
        body: "相続人招待を受け取りました。",
        related: { kind: "invite", id: inviteRef.id },
        isRead: false,
        createdAt: now
      });
    }

    return jsonOk(c, { inviteId: inviteRef.id });
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const scope = String(c.req.query("scope") ?? "");
    if (scope !== "owner" && scope !== "received") {
      return jsonError(c, 400, "VALIDATION_ERROR", "scopeの指定が不正です");
    }

    if (scope === "received" && !auth.email) {
      return jsonError(c, 400, "VALIDATION_ERROR", "メールアドレスが取得できません");
    }

    const db = getFirestore();
    const query =
      scope === "owner"
        ? db.collection("invites").where("ownerUid", "==", auth.uid)
        : db.collection("invites").where("email", "==", normalizeEmail(auth.email ?? ""));

    const snapshot = await query.get();
    const ownerUids = Array.from(
      new Set(snapshot.docs.map((doc) => doc.data()?.ownerUid).filter(Boolean))
    ) as string[];
    const ownerEmailMap = new Map<string, string | null>();
    if (scope === "received" && ownerUids.length > 0) {
      await Promise.all(
        ownerUids.map(async (ownerUid) => {
          try {
            const user = await getAuth().getUser(ownerUid);
            ownerEmailMap.set(ownerUid, user.email ?? null);
          } catch (error: any) {
            if (error?.code === "auth/user-not-found") {
              ownerEmailMap.set(ownerUid, null);
              return;
            }
            throw error;
          }
        })
      );
    }

    return jsonOk(
      c,
      snapshot.docs.map((doc) => {
        const data = doc.data();
        const acceptedAt = data.acceptedAt ? formatDate(data.acceptedAt) : null;
        const declinedAt = data.declinedAt ? formatDate(data.declinedAt) : null;
        return {
          inviteId: doc.id,
          ownerUid: data.ownerUid ?? "",
          ownerEmail: ownerEmailMap.get(data.ownerUid) ?? null,
          email: data.email ?? "",
          status: data.status ?? "pending",
          relationLabel: data.relationLabel ?? "",
          relationOther: data.relationOther ?? null,
          memo: data.memo ?? null,
          isExistingUserAtInvite: data.isExistingUserAtInvite ?? false,
          acceptedByUid: data.acceptedByUid ?? null,
          createdAt: formatDate(data.createdAt),
          updatedAt: formatDate(data.updatedAt),
          acceptedAt,
          declinedAt
        };
      })
    );
  });

  app.post(":inviteId/:action", async (c) => {
    const inviteId = c.req.param("inviteId");
    const action = c.req.param("action");
    if (action !== "accept" && action !== "decline") {
      return jsonError(c, 404, "NOT_FOUND", "Not found");
    }

    const auth = c.get("auth");
    if (!auth.email) {
      return jsonError(c, 400, "VALIDATION_ERROR", "メールアドレスが取得できません");
    }

    const db = getFirestore();
    const inviteRef = db.collection("invites").doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Invite not found");
    }
    const invite = inviteSnap.data() ?? {};
    const authEmail = normalizeEmail(auth.email);
    if (invite.email !== authEmail) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }

    const now = c.get("deps").now();
    if (action === "accept") {
      await inviteRef.set(
        {
          status: "accepted",
          acceptedByUid: auth.uid,
          acceptedAt: now,
          updatedAt: now
        },
        { merge: true }
      );

      const heirRef = db.collection("heirs").doc(auth.uid);
      const heirSnap = await heirRef.get();
      const createdAt = heirSnap.exists ? heirSnap.data()?.createdAt ?? now : now;
      await heirRef.set(
        {
          uid: auth.uid,
          ownerUid: invite.ownerUid,
          email: invite.email,
          relationLabel: invite.relationLabel ?? "",
          relationOther: invite.relationOther ?? null,
          memo: invite.memo ?? null,
          createdAt,
          updatedAt: now
        },
        { merge: true }
      );

      const notificationRef = db.collection("notifications").doc();
      await notificationRef.set({
        receiverUid: invite.ownerUid,
        type: "INVITE_ACCEPTED",
        title: "招待が受諾されました",
        body: "招待が受諾されました。",
        related: { kind: "invite", id: inviteId },
        isRead: false,
        createdAt: now
      });

      return jsonOk(c);
    }

    await inviteRef.set(
      {
        status: "declined",
        acceptedByUid: null,
        acceptedAt: null,
        declinedAt: now,
        updatedAt: now
      },
      { merge: true }
    );
    const notificationRef = db.collection("notifications").doc();
    await notificationRef.set({
      receiverUid: invite.ownerUid,
      type: "INVITE_DECLINED",
      title: "招待が辞退されました",
      body: "招待が辞退されました。",
      related: { kind: "invite", id: inviteId },
      isRead: false,
      createdAt: now
    });
    return jsonOk(c);
  });

  app.delete(":inviteId", async (c) => {
    const inviteId = c.req.param("inviteId");
    const auth = c.get("auth");
    const db = getFirestore();
    const inviteRef = db.collection("invites").doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Invite not found");
    }
    const invite = inviteSnap.data() ?? {};
    if (invite.ownerUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    if (invite.status === "accepted") {
      return jsonError(c, 400, "VALIDATION_ERROR", "受諾済みの招待は削除できません");
    }

    await inviteRef.delete();
    return jsonOk(c);
  });

  return app;
};
