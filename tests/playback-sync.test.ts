import { describe, expect, it } from "vitest";
import { playbackPollDelay, shouldApplyPlayback } from "@/lib/playback-sync";

describe("playback status reconciliation", () => {
  it("ignores responses started before a playback command", () => {
    expect(shouldApplyPlayback(1, 2, null, { isPlaying: false }, 100)).toBe(false);
  });

  it("keeps an optimistic track until Spotify reports the chosen track", () => {
    const pending = { revision: 2, until: 5_000, trackUri: "spotify:track:new", playing: true };
    expect(shouldApplyPlayback(2, 2, pending, { track: { uri: "spotify:track:old" }, isPlaying: true }, 1_000)).toBe(false);
    expect(shouldApplyPlayback(2, 2, pending, { track: { uri: "spotify:track:new" }, isPlaying: true }, 1_000)).toBe(true);
    expect(shouldApplyPlayback(2, 2, pending, { track: { uri: "spotify:track:old" }, isPlaying: true }, 5_000)).toBe(true);
  });

  it("respects Retry-After and backs off on network failures", () => {
    expect(playbackPollDelay(429, "20", 1, false)).toBe(20_000);
    expect(playbackPollDelay(429, null, 1, false)).toBe(30_000);
    expect(playbackPollDelay(503, null, 3, false)).toBe(24_000);
    expect(playbackPollDelay(200, null, 0, true)).toBe(12_000);
  });
});
