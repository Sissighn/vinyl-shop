import { NextResponse } from "next/server";
import { spotifyFetch } from "@/lib/spotify";
import { toRoomAlbum, type SpotifyCatalogAlbum } from "@/lib/spotify-album";

type SearchResult = {
  albums?: { items: SpotifyCatalogAlbum[]; total: number };
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  const offset = Number(params.get("offset") ?? "0");
  if (query.length < 2 || query.length > 100 || !Number.isInteger(offset) || offset < 0 || offset > 996) {
    return NextResponse.json({ error: "Invalid search" }, { status: 400 });
  }

  const spotifyParams = new URLSearchParams({ q: query, type: "album", limit: "4", offset: String(offset) });
  const response = await spotifyFetch(`/search?${spotifyParams}`);
  if (!response) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  if (!response.ok) {
    return NextResponse.json({ error: "Spotify search failed" }, { status: response.status });
  }

  const result = (await response.json()) as SearchResult;
  return NextResponse.json({
    albums: result.albums?.items.map(toRoomAlbum) ?? [],
    total: result.albums?.total ?? 0,
  });
}
