import { Hono } from "hono";
import { getFirestore } from "firebase-admin/firestore";
import type { ApiBindings } from "../types.js";
import { jsonError, jsonOk } from "../utils/response.js";
import { formatDate } from "../utils/date.js";

export const notificationsRoutes = () => {
  const app = new Hono<ApiBindings>();

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const db = getFirestore();
    const snapshot = await db
      .collection("notifications")
      .where("receiverUid", "==", auth.uid)
      .get();
    const data = snapshot.docs.map((doc) => {
      const notification = doc.data() ?? {};
      return {
        notificationId: doc.id,
        receiverUid: notification.receiverUid ?? "",
        type: notification.type ?? "",
        title: notification.title ?? "",
        body: notification.body ?? "",
        related: notification.related ?? null,
        isRead: Boolean(notification.isRead),
        createdAt: formatDate(notification.createdAt)
      };
    });
    return jsonOk(c, data);
  });

  app.post("/read-all", async (c) => {
    const auth = c.get("auth");
    const db = getFirestore();
    const snapshot = await db
      .collection("notifications")
      .where("receiverUid", "==", auth.uid)
      .get();
    await Promise.all(
      snapshot.docs.map((doc) =>
        doc.ref.set(
          {
            isRead: true,
            readAt: c.get("deps").now()
          },
          { merge: true }
        )
      )
    );
    return jsonOk(c);
  });

  app.post(":notificationId/read", async (c) => {
    const notificationId = c.req.param("notificationId");
    const auth = c.get("auth");
    const db = getFirestore();
    const notificationRef = db.collection("notifications").doc(notificationId);
    const notificationSnap = await notificationRef.get();
    if (!notificationSnap.exists) {
      return jsonError(c, 404, "NOT_FOUND", "Notification not found");
    }
    const notification = notificationSnap.data() ?? {};
    if (notification.receiverUid !== auth.uid) {
      return jsonError(c, 403, "FORBIDDEN", "権限がありません");
    }
    await notificationRef.set(
      {
        isRead: true,
        readAt: c.get("deps").now()
      },
      { merge: true }
    );
    return jsonOk(c);
  });

  return app;
};
