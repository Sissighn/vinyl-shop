import { NextResponse } from "next/server";

export function spotifyError(response: Response | null, fallback: string) {
  if (!response) return NextResponse.json({ error: "Connect Spotify to continue." }, { status: 401 });
  const retryAfter = response.headers.get("retry-after");
  const status = response.status;
  const error = status === 401 ? "Spotify sign-in expired. Reconnect Spotify."
    : status === 403 ? "Spotify denied this action. Check your Premium account and app access."
      : status === 404 ? "Spotify could not find this album or device."
        : status === 429 ? "Spotify is limiting requests. Please wait before trying again."
          : status === 502 || status === 503 || status === 504 ? "Spotify is temporarily unavailable. Try again shortly."
            : fallback;
  return NextResponse.json({ error }, {
    status: status >= 400 && status <= 599 ? status : 502,
    headers: { "cache-control": "no-store", ...(retryAfter ? { "retry-after": retryAfter } : {}) },
  });
}

export function trustedMutation(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const host = request.headers.get("host");
  let originUrl: URL | null = null;
  try { if (origin) originUrl = new URL(origin); } catch { /* Invalid Origin. */ }
  const desktop = process.env.VINYL_DESKTOP === "1";
  if (!originUrl || originUrl.origin !== origin || !host || originUrl.host !== host ||
      (desktop && (origin !== "http://127.0.0.1:17873" || host !== "127.0.0.1:17873")) ||
      (site && site !== "same-origin" && site !== "none")) {
    return NextResponse.json({ error: "Untrusted request origin." }, { status: 403 });
  }
  if (request.method !== "POST" && request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "JSON request required." }, { status: 415 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4096) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  return null;
}

export async function readSmallJson(request: Request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } catch { return null; }
}
