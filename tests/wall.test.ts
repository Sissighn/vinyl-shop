import { describe, expect, it } from "vitest";
import { exportWall, importWall, isWall, spotifyAlbumUrl, spotifyTrackUrl, swapWallSlots } from "@/lib/wall";

const album = { id: "a".repeat(22), title: "Kind of Blue", artist: "Miles Davis", image: "https://i.scdn.co/image/example", uri: `spotify:album:${"a".repeat(22)}` };

describe("wall arrangement", () => {
  it("moves an album to an empty spot", () => {
    const before = ["A", null, "B"];
    expect(swapWallSlots(before, 0, 1)).toEqual([null, "A", "B"]);
    expect(before).toEqual(["A", null, "B"]);
  });

  it("swaps two albums without losing either one", () => {
    expect(swapWallSlots(["A", "B"], 0, 1)).toEqual(["B", "A"]);
  });

  it("ignores an invalid source or destination", () => {
    expect(swapWallSlots(["A", null], 1, 0)).toEqual(["A", null]);
    expect(swapWallSlots(["A", null], 0, 4)).toEqual(["A", null]);
  });

  it("exports and restores a wall without storing artwork files", () => {
    const slots = [album, null, null, null, null, null, null, null];
    const file = exportWall(slots);
    expect(importWall(file)).toEqual(slots);
    expect(JSON.parse(file)).toMatchObject({ format: "vinyl-room-wall", version: 1 });
    expect(file).toContain(album.image);
    expect(spotifyAlbumUrl(album)).toBe(`https://open.spotify.com/album/${album.id}`);
    expect(spotifyTrackUrl(`spotify:track:${"b".repeat(22)}`)).toBe(`https://open.spotify.com/track/${"b".repeat(22)}`);
  });

  it("rejects malformed or unsafe imports", () => {
    expect(() => importWall("{" )).toThrow("valid JSON");
    expect(() => importWall(JSON.stringify({ format: "vinyl-room-wall", version: 1, slots: [] }))).toThrow("invalid albums");
    expect(isWall([{ ...album, image: "javascript:alert(1)" }, ...Array(7).fill(null)])).toBe(false);
    expect(spotifyTrackUrl("spotify:track:bad")).toBeNull();
  });
});
