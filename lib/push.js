// Web Push helper. INERT until VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY are set.
import webpush from 'web-push';

let configured = false;

export function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function ensureConfigured() {
  if (configured) return true;
  if (!pushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:andrew@national9.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  configured = true;
  return true;
}

// Send a notification to every stored subscription. Prunes dead subscriptions.
// payload: { title, body, url }
export async function sendPushToAll(db, payload) {
  if (!ensureConfigured()) return { sent: 0, total: 0, skipped: true };
  const subs = (await db.execute('SELECT id, endpoint, p256dh, auth FROM push_subscriptions')).rows;
  const body = JSON.stringify(payload);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      sent += 1;
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await db.execute({ sql: 'DELETE FROM push_subscriptions WHERE id = ?', args: [s.id] });
      }
    }
  }
  return { sent, total: subs.length };
}
