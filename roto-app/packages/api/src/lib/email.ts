// ponytail: D3 — email channel for SOS/live-trip alerts via a free-tier provider (Resend).
// No new dependency: Resend is called with plain fetch when EMAIL_API_KEY + EMAIL_FROM are set,
// otherwise this is a silent no-op and safety.trigger records provider "none" in channels.
export type EmailResult = {
  provider: string;
  sent: number;
  failed: number;
};

export async function sendEmail(to: string[], subject: string, text: string): Promise<EmailResult> {
  if (to.length === 0) return { provider: "none", sent: 0, failed: 0 };
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { provider: "none", sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const address of to) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: address, subject, text }),
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { provider: "resend", sent, failed };
}
