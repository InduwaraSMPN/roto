// ponytail: D3 — push channel for SOS/live-trip alerts to contacts who have Roto installed.
// Expo push service via plain fetch (no new dependency). Tokens come from push_tokens rows of
// contacts linked by email (sos_contacts.linkedUserId). Silent no-op when there is nothing to send.
export type PushResult = {
  provider: string;
  sent: number;
  failed: number;
};

export type PushMessage = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

export async function sendPush(messages: PushMessage[]): Promise<PushResult> {
  if (messages.length === 0) return { provider: "none", sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  // Expo allows batches of 100; contact lists are single-digit, one request is enough.
  try {
    const r = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        messages.map((m) => ({ to: m.token, title: m.title, body: m.body, data: m.data ?? {}, sound: "default", priority: "high" })),
      ),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return { provider: "expo", sent: 0, failed: messages.length };
    const json = (await r.json().catch(() => null)) as { data?: { status: string }[] } | null;
    const receipts = json?.data;
    if (!Array.isArray(receipts)) {
      // Non-standard response — assume accepted; delivery errors surface per-receipt only.
      return { provider: "expo", sent: messages.length, failed: 0 };
    }
    for (const receipt of receipts) {
      if (receipt?.status === "ok") sent += 1;
      else failed += 1;
    }
  } catch {
    failed = messages.length;
  }
  return { provider: "expo", sent, failed };
}
