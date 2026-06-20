// ============================================================================
// api/send-reminders — the Web Push sender (Vercel serverless, Node runtime).
// ----------------------------------------------------------------------------
// Triggered every minute (by Supabase pg_cron via pg_net — see migration
// 0044). For each enabled reminder whose chosen day + time match "now" in the
// reminder's own timezone, it picks a message (random / sequential), and sends
// a Web Push to every one of that user's stored subscriptions — so reminders
// arrive even when the app is closed.
//
// Auth: requires `Authorization: Bearer <CRON_SECRET>` (or ?secret=).
// Secrets (Vercel env): CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
//
// Dedup: each fired (reminder, local minute) is recorded in last_fired_key so a
// late/overlapping cron run never double-sends. Dead subscriptions (404/410)
// are pruned.
// ============================================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const DEFAULT_MESSAGE = 'הגיע הזמן שלך 🌱';

type Reminder = {
  id: string;
  user_id: string;
  enabled: boolean;
  title: string;
  days: number[];
  times: string[];
  messages: string[];
  message_order: 'random' | 'sequential';
  next_index: number;
  vibrate: boolean;
  timezone: string;
  last_fired_key: string | null;
};

/** Vibration pattern (ms) — kept in sync with delivery.ts VIBRATE_PATTERN. */
const VIBRATE_PATTERN = [180, 90, 180];

type Subscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

const WD: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Local date/time/weekday for a timezone at a given instant. */
function localParts(tz: string, at: Date): { date: string; time: string; day: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'Asia/Jerusalem',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(at)) map[p.type] = p.value;
  let hour = map.hour;
  if (hour === '24') hour = '00'; // some envs render midnight as 24
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${hour}:${map.minute}`,
    day: WD[map.weekday as keyof typeof WD] ?? 0,
  };
}

function pickMessage(r: Reminder): { body: string; nextIndex: number | null } {
  const msgs = (r.messages || []).map((m) => (m || '').trim()).filter(Boolean);
  if (msgs.length === 0) return { body: DEFAULT_MESSAGE, nextIndex: null };
  if (msgs.length === 1) return { body: msgs[0], nextIndex: null };
  if (r.message_order === 'sequential') {
    const idx = ((r.next_index % msgs.length) + msgs.length) % msgs.length;
    return { body: msgs[idx], nextIndex: r.next_index + 1 };
  }
  return { body: msgs[Math.floor(Math.random() * msgs.length)], nextIndex: null };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- auth ---------------------------------------------------------------
  const secret = process.env.CRON_SECRET;
  const header = req.headers['authorization'];
  const bearer = typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice(7)
    : undefined;
  const provided = bearer ?? (typeof req.query.secret === 'string' ? req.query.secret : undefined);
  if (!secret || provided !== secret) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:talbh818@gmail.com';
  const present = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: !!process.env.CRON_SECRET,
    VAPID_PUBLIC_KEY: !!process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: !!process.env.VAPID_SUBJECT,
    VITE_VAPID_PUBLIC_KEY: !!process.env.VITE_VAPID_PUBLIC_KEY,
  };
  if (!url || !serviceKey) {
    res.status(500).json({ error: 'missing supabase env', present });
    return;
  }
  if (!vapidPublic || !vapidPrivate) {
    res.status(500).json({ error: 'missing vapid env', present });
    return;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const now = new Date();
  // Check this minute AND the previous one, so a slightly-late cron run still
  // catches a reminder due on the boundary (dedup prevents a re-send).
  const candidates = [now, new Date(now.getTime() - 60_000)];

  const { data: reminders, error } = await supabase
    .from('notification_reminders')
    .select('*')
    .eq('enabled', true);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const subsByUser = new Map<string, Subscription[]>();
  async function subsFor(userId: string): Promise<Subscription[]> {
    const cached = subsByUser.get(userId);
    if (cached) return cached;
    const { data } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);
    const arr = (data ?? []) as Subscription[];
    subsByUser.set(userId, arr);
    return arr;
  }

  let due = 0;
  let sent = 0;
  let pruned = 0;

  for (const r of (reminders ?? []) as Reminder[]) {
    let fireKey: string | null = null;
    for (const c of candidates) {
      const lp = localParts(r.timezone, c);
      if (!Array.isArray(r.days) || !r.days.includes(lp.day)) continue;
      if (!Array.isArray(r.times) || !r.times.includes(lp.time)) continue;
      fireKey = `${lp.date} ${lp.time}`;
      break;
    }
    if (!fireKey) continue;
    if (r.last_fired_key === fireKey) continue; // already fired this minute
    due++;

    const { body, nextIndex } = pickMessage(r);
    const payload = JSON.stringify({
      title: r.title || 'תזכורת',
      body,
      tag: `reminder-${r.id}`,
      url: '/',
      // Closed-app vibration — the SW applies this to the shown notification.
      // (Custom sound isn't deliverable via push; the OS channel decides that.)
      vibrate: r.vibrate === false ? undefined : VIBRATE_PATTERN,
    });

    const subs = await subsFor(r.user_id);
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
          pruned++;
        }
      }
    }

    const patch: { last_fired_key: string; next_index?: number } = { last_fired_key: fireKey };
    if (nextIndex !== null) patch.next_index = nextIndex;
    await supabase.from('notification_reminders').update(patch).eq('id', r.id);
  }

  res.status(200).json({
    ok: true,
    checked: reminders?.length ?? 0,
    due,
    sent,
    pruned,
  });
}
