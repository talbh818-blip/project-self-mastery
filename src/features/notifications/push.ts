// ============================================================================
// Web Push subscription (Phase 2) — registers THIS device to receive pushes
// even when the app is closed, and stores the subscription in Supabase so the
// server-side sender can deliver to it.
//
// Flow: permission granted → pushManager.subscribe(VAPID public key) → upsert
// the subscription (endpoint + ECDH keys) into `push_subscriptions`. The sender
// (api/send-reminders) reads that table with the service role key.
//
// Degrades gracefully: if VITE_VAPID_PUBLIC_KEY isn't configured yet, or the
// browser lacks Push support, this is a silent no-op — the foreground scheduler
// still delivers while the app is open.
// ============================================================================
import { supabase } from '../../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

// True once this device has a working push subscription stored — the foreground
// scheduler then steps aside and lets the server deliver (no double-alerts).
let pushActive = false;
export function isPushActive(): boolean {
  return pushActive;
}

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window
  );
}

export function pushConfigured(): boolean {
  return typeof VAPID_PUBLIC_KEY === 'string' && VAPID_PUBLIC_KEY.length > 0;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Ensure this device has a push subscription stored in Supabase. Safe to call
 * on every app load when notifications are enabled — it reuses the existing
 * browser subscription and just refreshes the stored row (last_seen).
 * Requires the OS notification permission to already be 'granted'.
 */
export async function ensurePushSubscription(): Promise<boolean> {
  if (!pushSupported() || !pushConfigured()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
      });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const json = sub.toJSON();
    const endpoint = sub.endpoint;
    const p256dh = json.keys?.p256dh ?? bufToBase64Url(sub.getKey('p256dh'));
    const auth = json.keys?.auth ?? bufToBase64Url(sub.getKey('auth'));
    if (!endpoint || !p256dh || !auth) return false;

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null;
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: ua,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
    if (error) return false;

    // Push endpoints rotate across SW updates, leaving stale rows for the SAME
    // physical device → the sender would deliver a duplicate per stale row.
    // Drop this device's other (same user-agent) subscriptions so each device
    // keeps exactly one. Different devices have different user agents → kept.
    if (ua) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('user_agent', ua)
        .neq('endpoint', endpoint);
    }

    pushActive = true;
    return true;
  } catch {
    // Subscription can fail (permission revoked mid-flight, push service down,
    // VAPID mismatch). Non-fatal — foreground delivery still works.
    return false;
  }
}

/**
 * Unsubscribe this device from push and drop its stored row. Used when the
 * user turns the whole feature off.
 */
export async function removePushSubscription(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    pushActive = false;
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  } catch {
    /* non-fatal */
  }
}
