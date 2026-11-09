import { NextResponse } from "next/server";
import { z } from "zod";
import { spotifyFetch } from "@/lib/spotify";
import { readSmallJson, spotifyError, trustedMutation } from "@/lib/spotify-http";

const playbackRequest = z.object({
  contextUri: z.string().regex(/^spotify:album:[a-zA-Z0-9]{22}$/).optional(),
  trackUri: z.string().regex(/^spotify:track:[a-zA-Z0-9]{22}$/).optional(),
  deviceId: z.string().min(1).max(100).optional(),
  positionMs: z.number().int().min(0).max(43_200_000).optional(),
}).refine(({ trackUri, contextUri }) => !trackUri || Boolean(contextUri));

export async function PUT(request: Request) {
  const denied = trustedMutation(request);
  if (denied) return denied;
  const parsed = playbackRequest.safeParse(await readSmallJson(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid playback request" }, { status: 400 });
  const { contextUri, trackUri, deviceId, positionMs } = parsed.data;
  const path = `/me/player/play${deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ""}`;
  const response = await spotifyFetch(path, {
    method: "PUT",
    ...(contextUri ? {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context_uri: contextUri, ...(trackUri ? { offset: { uri: trackUri } } : {}), ...(positionMs !== undefined ? { position_ms: positionMs } : {}) }),
    } : {}),
  });
  if (!response?.ok) return spotifyError(response, "Could not start Spotify playback. Open Spotify on your Mac and try again.");
  return new NextResponse(null, { status: 204 });
}
