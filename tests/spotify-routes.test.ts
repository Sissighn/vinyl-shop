import { beforeEach, describe, expect, it, vi } from "vitest";

const spotifyFetch = vi.fn();
vi.mock("@/lib/spotify", () => ({ spotifyFetch }));

const endpoint = "http://127.0.0.1:17873/api/spotify/play";
const albumId = "a".repeat(22);
const trackId = "b".repeat(22);

function playRequest(body: unknown, origin = "http://127.0.0.1:17873") {
  return new Request(endpoint, {
    method: "PUT",
    headers: { host: "127.0.0.1:17873", origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("playback API", () => {
  beforeEach(() => spotifyFetch.mockReset());

  it("plays a selected track within the album context exactly once", async () => {
    spotifyFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const { PUT } = await import("@/app/api/spotify/play/route");
    const response = await PUT(playRequest({ contextUri: `spotify:album:${albumId}`, trackUri: `spotify:track:${trackId}`, deviceId: "mac-device" }));
    expect(response.status).toBe(204);
    expect(spotifyFetch).toHaveBeenCalledTimes(1);
    expect(spotifyFetch.mock.calls[0][0]).toBe("/me/player/play?device_id=mac-device");
    expect(JSON.parse(spotifyFetch.mock.calls[0][1].body)).toEqual({ context_uri: `spotify:album:${albumId}`, offset: { uri: `spotify:track:${trackId}` } });
  });

  it("rejects a track without album context and an untrusted origin", async () => {
    const { PUT } = await import("@/app/api/spotify/play/route");
    expect((await PUT(playRequest({ trackUri: `spotify:track:${trackId}` }))).status).toBe(400);
    expect((await PUT(playRequest({ contextUri: `spotify:album:${albumId}` }, "https://other.example"))).status).toBe(403);
    expect(spotifyFetch).not.toHaveBeenCalled();
  });
});

describe("catalog search", () => {
  beforeEach(() => spotifyFetch.mockReset());

  it("requests ten albums per page within Spotify's offset limit", async () => {
    spotifyFetch.mockResolvedValue(Response.json({ albums: { items: [], total: 45 } }));
    const { GET } = await import("@/app/api/spotify/search/route");
    const response = await GET(new Request("http://127.0.0.1:17873/api/spotify/search?q=jazz&offset=10"));
    expect(response.status).toBe(200);
    expect(spotifyFetch.mock.calls[0][0]).toContain("limit=10&offset=10");
    expect((await response.json() as { total: number }).total).toBe(45);
    expect((await GET(new Request("http://127.0.0.1:17873/api/spotify/search?q=jazz&offset=1010"))).status).toBe(400);
  });
});
