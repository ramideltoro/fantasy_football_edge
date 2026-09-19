import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";
export const list = (v: any): any[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];
export class YahooError extends Error {
  constructor(
    public kind: string,
    public retrySeconds = 3600,
  ) {
    super(kind);
  }
}
export const yahooMessage = (kind: string) =>
  ({
    select_league: "Choose an authorized league in Operations.",
    approval_required:
      "Yahoo has not granted this application Fantasy Sports API access. Yahoo must approve the application before league sync can work.",
    reconnect:
      "Yahoo authorization expired or was revoked. Connect Yahoo again.",
    cooldown:
      "Yahoo rate limit reached. Automatic sync will retry after the cooldown.",
    failed: "Yahoo sync failed. The last complete snapshot has been retained.",
  })[kind] ||
  "Yahoo sync failed. The last complete snapshot has been retained.";
export type YahooToken = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};
export function sealToken(token: YahooToken, key: string) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(token)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
export function openToken(value: string, key: string): YahooToken {
  const b = Buffer.from(value, "base64"),
    d = crypto.createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      b.subarray(0, 12),
    );
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([d.update(b.subarray(28)), d.final()]).toString(),
  );
}
export async function exchangeToken(
  params: Record<string, string>,
  clientId: string,
  secret: string,
  old?: YahooToken,
): Promise<YahooToken> {
  const r = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(clientId + ":" + secret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok)
    throw new YahooError(
      r.status === 400 || r.status === 401 ? "reconnect" : "failed",
    );
  const t = await r.json();
  if (
    typeof t.access_token !== "string" ||
    !(t.refresh_token || old?.refresh_token) ||
    !Number.isFinite(Number(t.expires_in))
  )
    throw new YahooError("failed");
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token || old!.refresh_token,
    expires_at: Date.now() + Number(t.expires_in) * 1000,
  };
}
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  processEntities: false,
});
export async function yahooGet(path: string, token: string) {
  const r = await fetch(
    "https://fantasysports.yahooapis.com/fantasy/v2/" + path,
    {
      headers: { Authorization: "Bearer " + token, Accept: "application/xml" },
      signal: AbortSignal.timeout(25000),
    },
  );
  const body = await r.text();
  if (!r.ok) {
    if (r.status === 429 || r.status === 999)
      throw new YahooError(
        "cooldown",
        Math.max(3600, Number(r.headers.get("retry-after")) || 3600),
      );
    if (body.includes("additional_authorization_required") || r.status === 403)
      throw new YahooError("approval_required");
    throw new YahooError(r.status === 401 ? "reconnect" : "failed");
  }
  if (body.length > 8_000_000) throw new YahooError("failed");
  const data = parser.parse(body)?.fantasy_content;
  if (!data) throw new YahooError("failed");
  return data;
}
