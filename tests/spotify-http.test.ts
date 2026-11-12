import { describe, expect, it } from "vitest";
import { readSmallJson, spotifyError, trustedMutation } from "@/lib/spotify-http";

const endpoint = "http://127.0.0.1:17873/api/spotify/play";

function request(origin?: string, body = "{}") {
  return new Request(endpoint, {
    method: "PUT",
    headers: { host: "127.0.0.1:17873", "content-type": "application/json", ...(origin ? { origin } : {}) },
    body,
  });
}

describe("Spotify API boundaries", () => {
  it("rejects missing and cross-origin mutations", () => {
    expect(trustedMutation(request())?.status).toBe(403);
    expect(trustedMutation(request("https://evil.example"))?.status).toBe(403);
    expect(trustedMutation(request("http://127.0.0.1:17873"))).toBeNull();
  });

  it("rejects oversized or malformed JSON", async () => {
    const large = request("http://127.0.0.1:17873", "a".repeat(4097));
    expect(await readSmallJson(large)).toBeNull();
    const declaredLarge = new Request(endpoint, { method: "PUT", headers: { host: "127.0.0.1:17873", origin: "http://127.0.0.1:17873", "content-type": "application/json", "content-length": "5000" }, body: "{}" });
    expect(trustedMutation(declaredLarge)?.status).toBe(413);
    expect(await readSmallJson(request("http://127.0.0.1:17873", "{"))).toBeNull();
  });

  it("preserves a Spotify rate limit for the client", async () => {
    const response = spotifyError(new Response(null, { status: 429, headers: { "retry-after": "15" } }), "Failed");
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("15");
    expect((await response.json() as { error: string }).error).toContain("limiting requests");
  });
});
