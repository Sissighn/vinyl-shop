import { NextResponse } from "next/server";
import { spotifyFetch } from "@/lib/spotify";

export async function GET() {
  const response = await spotifyFetch("/me/player");
  if (!response) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  if (response.status === 204) return NextResponse.json({ deviceId: null, isPlaying: false });
  if (!response.ok) return NextResponse.json({ error: "Could not read Spotify playback" }, { status: response.status });

  const state = (await response.json()) as {
    device?: { id?: string | null } | null;
    is_playing?: boolean;
    progress_ms?: number | null;
    shuffle_state?: boolean;
    repeat_state?: "off" | "track" | "context";
    item?: {
      type?: string;
      uri?: string;
      name?: string;
      duration_ms?: number;
      artists?: { name: string }[];
      album?: { name?: string; uri?: string; images?: { url: string }[] };
    } | null;
  };
  const item = state.item?.type === "track" && state.item.uri ? state.item : null;
  return NextResponse.json({
    deviceId: state.device?.id ?? null,
    isPlaying: state.is_playing === true,
    progressMs: state.progress_ms ?? 0,
    shuffle: state.shuffle_state === true,
    repeat: state.repeat_state ?? "off",
    track: item ? {
      uri: item.uri,
      name: item.name ?? "Unknown track",
      artist: item.artists?.map((artist) => artist.name).join(", ") ?? "Unknown artist",
      durationMs: item.duration_ms ?? 0,
      albumTitle: item.album?.name ?? "Album",
      albumUri: item.album?.uri ?? "",
    } : null,
  }, { headers: { "cache-control": "no-store" } });
}
