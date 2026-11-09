import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined,
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));
vi.mock("@/lib/spotify-desktop", () => ({ isDesktop: () => true }));

describe("Spotify token and API access", () => {
  beforeEach(() => {
    vi.resetModules();
    jar.clear();
    process.env.SPOTIFY_CLIENT_ID = "a".repeat(32);
    jar.set("spotify_refresh_token", "refresh-one");
  });

  it("deduplicates concurrent refreshes", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("accounts.spotify.com")) return Response.json({ access_token: "new-token", expires_in: 3600 });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { spotifyFetch } = await import("@/lib/spotify");
    const [a, b] = await Promise.all([spotifyFetch("/me/player"), spotifyFetch("/me/player/devices")]);
    expect(a?.status).toBe(204);
    expect(b?.status).toBe(204);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("accounts.spotify.com"))).toHaveLength(1);
    expect(jar.get("spotify_access_token")).toBe("new-token");
    vi.unstubAllGlobals();
  });

  it("clears invalid credentials and returns 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 400 })));
    const { spotifyFetch } = await import("@/lib/spotify");
    expect((await spotifyFetch("/me/player"))?.status).toBe(401);
    expect(jar.has("spotify_refresh_token")).toBe(false);
    vi.unstubAllGlobals();
  });

  it("surfaces temporary Spotify outages without logging out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const { spotifyFetch } = await import("@/lib/spotify");
    expect((await spotifyFetch("/me/player"))?.status).toBe(503);
    expect(jar.get("spotify_refresh_token")).toBe("refresh-one");
    vi.unstubAllGlobals();
  });
});
