// ═══════════════════════════════════════════════════════════════════════════
//  GTS HUB — OUTGOING WEBHOOKS (client)
//  The browser never calls the third-party URL directly (CORS, and the
//  firewall on B&H machines): it hands the event to /api/webhook, which
//  relays it server-side. Gated by the team passcode like every other API.
// ═══════════════════════════════════════════════════════════════════════════
import { headers } from './sync';

export const WEBHOOK_EVENTS = [
  { id: 'ticket.create', label: 'Ticket logged' },
  { id: 'ticket.done', label: 'Service finished (with duration)' },
  { id: 'assignment.create', label: 'Device checked in overnight' },
];

export async function sendWebhook(url, event, payload, passcode) {
  const res = await fetch('/api/webhook', { method: 'POST', headers: headers(passcode), body: JSON.stringify({ url, event, payload }) });
  const data = await res.json().catch(() => ({}));
  return { ...data, status: res.status };
}
