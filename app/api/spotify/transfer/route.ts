import { NextResponse } from "next/server";
import { z } from "zod";
import { spotifyFetch } from "@/lib/spotify";

const transferRequest = z.object({ deviceId: z.string().min(1).max(100) });

export async function PUT(request: Request) {
  const parsed = transferRequest.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid device" }, { status: 400 });
  const response = await spotifyFetch("/me/player", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_ids: [parsed.data.deviceId], play: false }),
  });
  if (!response) return NextResponse.json({ error: "Not connected" }, { status: 401 });
  if (!response.ok) return NextResponse.json({ error: "Could not activate Vinyl Room player" }, { status: response.status });
  return new NextResponse(null, { status: 204 });
}
