import { NextResponse } from "next/server";
import { z } from "zod";
import { spotifyFetch } from "@/lib/spotify";
import { readSmallJson, spotifyError, trustedMutation } from "@/lib/spotify-http";

const controlRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("next"), deviceId: z.string().min(1).max(100) }),
  z.object({ action: z.literal("previous"), deviceId: z.string().min(1).max(100) }),
  z.object({ action: z.literal("shuffle"), deviceId: z.string().min(1).max(100), enabled: z.boolean() }),
  z.object({ action: z.literal("repeat"), deviceId: z.string().min(1).max(100), mode: z.enum(["off", "track", "context"]) }),
  z.object({ action: z.literal("seek"), deviceId: z.string().min(1).max(100), positionMs: z.number().int().min(0).max(43_200_000) }),
]);

export async function PUT(request: Request) {
  const denied = trustedMutation(request);
  if (denied) return denied;
  const parsed = controlRequest.safeParse(await readSmallJson(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid playback control" }, { status: 400 });

  const control = parsed.data;
  const query = new URLSearchParams({ device_id: control.deviceId });
  let path: string;
  let method: "PUT" | "POST" = "PUT";
  switch (control.action) {
    case "next":
    case "previous":
      path = `/me/player/${control.action}`;
      method = "POST";
      break;
    case "shuffle":
      path = "/me/player/shuffle";
      query.set("state", String(control.enabled));
      break;
    case "repeat":
      path = "/me/player/repeat";
      query.set("state", control.mode);
      break;
    case "seek":
      path = "/me/player/seek";
      query.set("position_ms", String(control.positionMs));
      break;
  }

  const response = await spotifyFetch(`${path}?${query}`, { method });
  if (!response?.ok) return spotifyError(response, "Spotify playback control failed.");
  return new NextResponse(null, { status: 204 });
}
