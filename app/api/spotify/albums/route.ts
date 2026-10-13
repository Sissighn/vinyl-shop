import { NextResponse } from "next/server";
import { spotifyFetch } from "@/lib/spotify";
import { toRoomAlbum, type SpotifyCatalogAlbum } from "@/lib/spotify-album";

// Restore walls saved by the previous version, which stored only Spotify IDs.
export async function GET(request: Request) {
  const ids = new URL(request.url).searchParams.get("ids")?.split(",") ?? [];
  if (ids.length === 0 || ids.length > 8 || ids.some((id) => !/^[a-zA-Z0-9]{22}$/.test(id))) {
    return NextResponse.json({ error: "Invalid album IDs" }, { status: 400 });
  }

  const responses = await Promise.all(ids.map((id) => spotifyFetch(`/albums/${id}`)));
  if (responses.some((response) => response === null)) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }
  if (responses.some((response) => response && !response.ok && response.status !== 404)) {
    return NextResponse.json({ error: "Could not load albums" }, { status: 502 });
  }

  const albums = await Promise.all(responses.map(async (response) => {
    if (!response?.ok) return null;
    return toRoomAlbum((await response.json()) as SpotifyCatalogAlbum);
  }));
  return NextResponse.json({ albums: albums.filter((album) => album !== null) });
}
