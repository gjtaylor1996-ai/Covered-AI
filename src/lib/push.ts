import webpush from "web-push";
import { db } from "@/lib/db";

let configured = false;

/**
 * Lazily configures web-push so routes that never send a notification
 * still work without VAPID keys set (e.g. local dev before generating
 * them). Anything that actually calls sendPushToWorker without the keys
 * configured gets a clear error instead of a silent no-op.
 */
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT are not set — push notifications are configured but no VAPID identity exists yet. See .env.example."
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

/**
 * Sends a push notification to every device a worker has enabled
 * notifications on. Not in the spec — the one native-feeling touch this
 * app has, since shift offers have a hard response deadline (see
 * RESPOND_WINDOW_HOURS in the offer route) and a worker who's not
 * looking at the app when one lands can otherwise miss it entirely.
 *
 * Best-effort: a failed send never blocks the action that triggered it
 * (an offer still goes out even if push delivery fails). A subscription
 * the push service reports as gone (410, or 404 — some services use it
 * instead) gets deleted so it stops being retried.
 */
export async function sendPushToWorker(workerId: string, payload: PushPayload): Promise<void> {
  ensureConfigured();

  const subscriptions = await db.pushSubscription.findMany({ where: { workerId } });
  if (subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    })
  );
}
