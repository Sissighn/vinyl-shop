import type { RoomAlbum } from "@/components/vinyl-room-scene";

export const WALL_KEY = "vinyl-room-wall-v2";

export function isRoomAlbum(value: unknown): value is RoomAlbum {
  if (!value || typeof value !== "object") return false;
  const album = value as Record<string, unknown>;
  if (typeof album.id !== "string" || !/^[a-zA-Z0-9]{22}$/.test(album.id) ||
      typeof album.title !== "string" || !album.title.trim() || album.title.length > 300 ||
      typeof album.artist !== "string" || !album.artist.trim() || album.artist.length > 300 ||
      typeof album.image !== "string" || album.image.length > 2048 ||
      album.uri !== `spotify:album:${album.id}`) return false;
  if (!album.image) return true;
  try {
    const image = new URL(album.image);
    return image.protocol === "https:" && (image.hostname === "i.scdn.co" ||
      image.hostname.endsWith(".scdn.co") || image.hostname.endsWith(".spotifycdn.com"));
  } catch { return false; }
}

export function isWall(value: unknown): value is (RoomAlbum | null)[] {
  return Array.isArray(value) && value.length === 8 && value.every((album) => album === null || isRoomAlbum(album));
}

export function exportWall(slots: readonly (RoomAlbum | null)[]) {
  if (!isWall(slots)) throw new Error("The wall contains invalid album data.");
  return JSON.stringify({ format: "vinyl-room-wall", version: 1, exportedAt: new Date().toISOString(), slots }, null, 2);
}

export function importWall(text: string): (RoomAlbum | null)[] {
  if (new TextEncoder().encode(text).byteLength > 64_000) throw new Error("The wall file is too large.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("This is not a valid JSON file."); }
  if (!value || typeof value !== "object") throw new Error("This is not a Vinyl Room wall file.");
  const file = value as Record<string, unknown>;
  if (file.format !== "vinyl-room-wall" || file.version !== 1 || !isWall(file.slots)) {
    throw new Error("This wall file has an unsupported format or invalid albums.");
  }
  return file.slots;
}

export function spotifyAlbumUrl(album: RoomAlbum) {
  return `https://open.spotify.com/album/${album.id}`;
}

export function spotifyTrackUrl(uri: string) {
  const match = /^spotify:track:([a-zA-Z0-9]{22})$/.exec(uri);
  return match ? `https://open.spotify.com/track/${match[1]}` : null;
}

export function swapWallSlots<T>(slots: readonly (T | null)[], from: number, to: number) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 ||
      from >= slots.length || to >= slots.length || from === to || !slots[from]) return [...slots];
  const next = [...slots];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
