import { NextResponse } from "next/server";
import { spotifyFetch } from "@/lib/spotify";

type SpotifyTrack = {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  disc_number: number;
  track_number: number;
  artists: Array<{ name: string }>;
  is_playable?: boolean;
};

type SpotifyTracksPage = {
  items: SpotifyTrack[];
  total: number;
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const offset = Number(new URL(request.url).searchParams.get("offset") ?? "0");
  if (!/^[a-zA-Z0-9]{22}$/.test(id) || !Number.isInteger(offset) || offset < 0 || offset > 1000) {
    return NextResponse.json({ error: "Invalid album or offset" }, { status: 400 });
  }

  const response = await spotifyFetch(`/albums/${id}/tracks?limit=50&offset=${offset}`);
  if (!response) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  if (!response.ok) return NextResponse.json({ error: "Could not load tracks" }, { status: response.status });

  const page = (await response.json()) as SpotifyTracksPage;
  return NextResponse.json({
    tracks: page.items.map((track) => ({
      id: track.id,
      name: track.name,
      uri: track.uri,
      artist: track.artists.map((artist) => artist.name).join(", "),
      durationMs: track.duration_ms,
      discNumber: track.disc_number,
      trackNumber: track.track_number,
      playable: track.is_playable !== false,
    })),
    total: page.total,
  });
}
