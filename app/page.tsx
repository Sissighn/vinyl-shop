"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Disc3, Download, ExternalLink, Music2, Pause, Play, Plus, Repeat2, Search, Shuffle, SkipBack, SkipForward, Trash2, Undo2, Upload, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { RoomAlbum } from "@/components/vinyl-room-scene";
import { SpotifyLogo } from "@/components/spotify-logo";
import { pendingPlayback, playbackPollDelay, shouldApplyPlayback, type PendingPlayback } from "@/lib/playback-sync";
import { exportWall, importWall, isWall, spotifyAlbumUrl, spotifyTrackUrl, swapWallSlots, WALL_KEY } from "@/lib/wall";

const VinylRoomScene = lazy(() => import("@/components/vinyl-room-scene"));

const EMPTY_SLOTS: (RoomAlbum | null)[] = Array.from({ length: 8 }, () => null);
const SEARCH_PAGE_SIZE = 10;

type AlbumTrack = {
  id: string;
  name: string;
  uri: string;
  artist: string;
  durationMs: number;
  discNumber: number;
  trackNumber: number;
  playable: boolean;
};

type SpotifyDevice = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isRestricted: boolean;
};

type PlaybackTrack = {
  uri: string;
  name: string;
  artist: string;
  durationMs: number;
  albumTitle: string;
  albumUri: string;
};

type PlaybackState = {
  deviceId: string | null;
  isPlaying: boolean;
  progressMs?: number;
  shuffle?: boolean;
  repeat?: "off" | "track" | "context";
  track?: PlaybackTrack | null;
};

class SpotifyRequestError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter: string | null) { super(message); }
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return new SpotifyRequestError(body?.error ?? fallback, response.status, response.headers.get("retry-after"));
}

function computerDevices(devices: SpotifyDevice[]) {
  return devices.filter((device) => device.type.toLowerCase() === "computer" && !device.isRestricted);
}

function chooseComputer(devices: SpotifyDevice[], preferredId: string | null) {
  const computers = computerDevices(devices);
  return computers.find((device) => device.id === preferredId) ??
    computers.find((device) => device.isActive) ?? computers[0] ?? null;
}

function trackDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [slots, setSlots] = useState<(RoomAlbum | null)[]>(EMPTY_SLOTS);
  const [wallHistory, setWallHistory] = useState<(RoomAlbum | null)[][]>([]);
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [selected, setSelected] = useState<RoomAlbum | null>(null);
  const [currentTrack, setCurrentTrack] = useState<PlaybackTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [progressMs, setProgressMs] = useState(0);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "track" | "context">("off");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tracks, setTracks] = useState<AlbumTrack[]>([]);
  const [trackTotal, setTrackTotal] = useState(0);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState<string | null>(null);
  const [playbackBusy, setPlaybackBusy] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [targetSlot, setTargetSlot] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPage, setSearchPage] = useState(0);
  const [searchRetryKey, setSearchRetryKey] = useState(0);
  const [searchResults, setSearchResults] = useState<RoomAlbum[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [guideDismissed, setGuideDismissed] = useState(false);
  const albumIdRef = useRef<string | null>(null);
  const albumPanelRef = useRef<HTMLElement | null>(null);
  const activeSlotRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const playbackRevisionRef = useRef(0);
  const pendingPlaybackRef = useRef<PendingPlayback | null>(null);

  function markPlaybackChange(expected: { trackUri?: string; playing?: boolean } = {}) {
    const revision = ++playbackRevisionRef.current;
    pendingPlaybackRef.current = pendingPlayback(revision, expected);
    return revision;
  }

  function clearFailedPlaybackChange(revision: number) {
    if (pendingPlaybackRef.current?.revision === revision) pendingPlaybackRef.current = null;
  }

  const refreshDevices = useCallback(async () => {
    const response = await fetch("/api/spotify/devices", { cache: "no-store" });
    if (response.status === 401) {
      setNeedsReconnect(true);
      throw new Error("Reconnect Spotify to allow Mac playback controls.");
    }
    if (!response.ok) throw await responseError(response, "Could not find your Spotify devices. Try again.");
    const data = (await response.json()) as { devices: SpotifyDevice[] };
    setNeedsReconnect(false);
    setDeviceError(null);
    setDevices(data.devices);
    setDeviceId((current) => chooseComputer(data.devices, current)?.id ?? null);
    return data.devices;
  }, []);

  useEffect(() => {
    if (!connected || needsReconnect) return;
    let active = true;
    let timer: number;
    let failures = 0;
    const update = async () => {
      let delay = 15_000;
      try {
        await refreshDevices();
        failures = 0;
      } catch (error) {
        if (active) setDeviceError(error instanceof Error ? error.message : "Could not find your Spotify devices.");
        failures += 1;
        delay = playbackPollDelay(error instanceof SpotifyRequestError ? error.status : 0,
          error instanceof SpotifyRequestError ? error.retryAfter : null, failures, document.hidden);
      }
      if (active) timer = window.setTimeout(() => void update(), delay);
    };
    void update();
    return () => { active = false; window.clearTimeout(timer); };
  }, [connected, needsReconnect, refreshDevices]);

  useEffect(() => {
    if (!connected || !deviceId) return;
    let active = true;
    let timer: number;
    let failures = 0;
    const syncPlayback = async () => {
      const revision = playbackRevisionRef.current;
      let delay = playbackPollDelay(200, null, 0, document.hidden);
      try {
        const response = await fetch("/api/spotify/playback-state", { cache: "no-store" });
        if (!response.ok) {
          failures += 1;
          delay = playbackPollDelay(response.status, response.headers.get("retry-after"), failures, document.hidden);
          if (response.status === 401 && active) setNeedsReconnect(true);
          return;
        }
        failures = 0;
        const state = (await response.json()) as PlaybackState;
        if (!active) return;
        if (!shouldApplyPlayback(revision, playbackRevisionRef.current, pendingPlaybackRef.current, state, Date.now())) return;
        pendingPlaybackRef.current = null;
        if (state.deviceId !== deviceId) {
          setPlaying(false);
          return;
        }
        setPlaying(state.isPlaying);
        if (state.track) setCurrentTrack(state.track);
        setProgressMs(state.progressMs ?? 0);
        setShuffle(state.shuffle ?? false);
        setRepeatMode(state.repeat ?? "off");
      } catch {
        failures += 1;
        delay = playbackPollDelay(0, null, failures, document.hidden);
      } finally {
        if (active) timer = window.setTimeout(() => void syncPlayback(), delay);
      }
    };
    timer = window.setTimeout(() => void syncPlayback(), 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [connected, deviceId]);

  useEffect(() => {
    if (!playing || !currentTrack) return;
    const timer = window.setInterval(() => setProgressMs((value) => Math.min(value + 1000, currentTrack.durationMs)), 1000);
    return () => window.clearInterval(timer);
  }, [playing, currentTrack]);

  useEffect(() => {
    if (!detailsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !albumPanelRef.current?.contains(event.target)) setDetailsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDetailsOpen(false);
      const slot = activeSlotRef.current;
      if (slot !== null) window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-wall-slot="${slot}"]`)?.focus(), 0);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [detailsOpen]);

  useEffect(() => {
    if (!detailsOpen) return;
    const timer = window.setTimeout(() => albumPanelRef.current?.querySelector<HTMLButtonElement>(".panel-heading button")?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [detailsOpen]);

  useEffect(() => {
    if (!arranging) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setArranging(false);
      setTargetSlot(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [arranging]);

  useEffect(() => {
    if (!arranging || targetSlot === null || !connected) return;
    const timer = window.setTimeout(() => document.querySelector<HTMLInputElement>(".panel-search input")?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [arranging, targetSlot, connected]);

  useEffect(() => {
    let active = true;
    let retryTimer: number;
    let attempts = 0;
    const scheduleRetry = (status: number, retryAfter: string | null, storedWall: string | null) => {
      attempts += 1;
      retryTimer = window.setTimeout(() => void checkSession(storedWall), playbackPollDelay(status, retryAfter, attempts, document.hidden));
    };
    const checkSession = async (storedWall: string | null) => {
      let response: Response;
      let data: { connected: boolean };
      try {
        response = await fetch("/api/spotify/session", { cache: "no-store" });
        if (!active) return;
        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) scheduleRetry(response.status, response.headers.get("retry-after"), storedWall);
          return;
        }
        data = await response.json() as { connected: boolean };
      } catch {
        if (active) scheduleRetry(0, null, storedWall);
        return;
      }
      if (!active || !data.connected) return;
      setConnected(true);
      if (storedWall || window.localStorage.getItem(WALL_KEY)) return;
      try {
        const oldWall = window.localStorage.getItem("vinyl-room-wall-v1");
        if (!oldWall) return;
        const savedIds = JSON.parse(oldWall) as unknown;
        if (!Array.isArray(savedIds) || savedIds.length !== 8) return;
        const ids = [...new Set(savedIds.filter((id): id is string => typeof id === "string"))];
        if (ids.length === 0) return;
        const albumsResponse = await fetch(`/api/spotify/albums?ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" });
        if (!albumsResponse.ok || !active) return;
        const { albums } = (await albumsResponse.json()) as { albums: RoomAlbum[] };
        const restored = savedIds.map((id) => albums.find((album) => album.id === id) ?? null);
        setSlots(restored);
        window.localStorage.setItem(WALL_KEY, JSON.stringify(restored));
      } catch {
        // An old wall is optional; the current room remains available.
      }
    };
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      if (query.has("spotify")) {
        setMessage(query.get("spotify") === "connected"
          ? "Spotify connected. Search for albums to add to your wall."
          : "Could not connect to Spotify. Check the configuration.");
        window.history.replaceState({}, "", window.location.pathname);
      }

      const storedWall = window.localStorage.getItem(WALL_KEY);
      if (storedWall) {
        try {
          const saved = JSON.parse(storedWall) as unknown;
          if (isWall(saved)) {
            setSlots(saved);
          }
        } catch { /* Ignore an invalid local wall. */ }
      }

      void checkSession(storedWall);
    }, 0);
    return () => { active = false; window.clearTimeout(timer); window.clearTimeout(retryTimer); };
  }, []);

  useEffect(() => {
    if (!arranging || !connected || searchQuery.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: searchQuery.trim(), offset: String(searchPage * SEARCH_PAGE_SIZE) });
        const response = await fetch(`/api/spotify/search?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw await responseError(response, "Search is unavailable. Try again.");
        const data = (await response.json()) as { albums: RoomAlbum[]; total: number };
        setSearchResults(data.albums);
        setSearchTotal(data.total);
        setSearchError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchResults([]);
        setSearchTotal(0);
        setSearchError(error instanceof Error ? error.message : "Search is unavailable. Try again.");
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [arranging, connected, searchQuery, searchPage, searchRetryKey]);

  useEffect(() => {
    if (connected) return;
    let active = true;
    const checkDesktopSignIn = async () => {
      try {
        const response = await fetch("/api/spotify/desktop-session", { cache: "no-store" });
        const result = await response.json() as { desktop: boolean; status?: string; message?: string };
        if (!active) return;
        if (!result.desktop) {
          window.clearInterval(timer);
        } else if (result.status === "connected") {
          window.location.reload();
        } else if (result.status === "error") {
          setMessage(result.message ?? "Spotify sign-in failed.");
        }
      } catch {
        // Keep the room usable while the local server starts.
      }
    };
    const timer = window.setInterval(() => void checkDesktopSignIn(), 1500);
    void checkDesktopSignIn();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [connected]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const albumId = selected.id;
    const loadTracks = async () => {
      try {
        const response = await fetch(`/api/spotify/albums/${albumId}/tracks`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw await responseError(response, "Could not load this album's tracks.");
        const data = (await response.json()) as { tracks: AlbumTrack[]; total: number };
        setTracks(data.tracks);
        setTrackTotal(data.total);
        setTracksError(null);
      } catch (error) {
        if (!controller.signal.aborted) setTracksError(error instanceof Error ? error.message : "Could not load this album's tracks.");
      } finally {
        if (!controller.signal.aborted) setTracksLoading(false);
      }
    };
    void loadTracks();
    return () => controller.abort();
  }, [selected]);

  const handleSlotClick = useCallback((index: number) => {
    if (arranging) {
      setTargetSlot(index);
      return;
    }
    const album = slots[index];
    if (!album) {
      setTargetSlot(index);
      setArranging(true);
      return;
    }
    if (selected?.id !== album.id) {
      albumIdRef.current = album.id;
      setSelected(album);
      setTracks([]);
      setTrackTotal(0);
      setTracksLoading(true);
      setTracksError(null);
    }
    activeSlotRef.current = index;
    setDetailsOpen(true);
  }, [arranging, selected, slots]);

  const commitWall = useCallback((nextSlots: (RoomAlbum | null)[], notice: string) => {
    if (slots.every((album, index) => album?.id === nextSlots[index]?.id)) return false;
    setWallHistory((history) => [...history.slice(-19), slots]);
    setSlots(nextSlots);
    window.localStorage.setItem(WALL_KEY, JSON.stringify(nextSlots));
    setMessage(notice);
    return true;
  }, [slots]);

  const handleSlotDrop = useCallback((from: number, to: number) => {
    if (from === to || !slots[from]) return;
    const nextSlots = swapWallSlots(slots, from, to);
    commitWall(nextSlots, `Wall spots ${from + 1} and ${to + 1} updated.`);
    setDetailsOpen(false);
    setTargetSlot(null);
  }, [slots, commitWall]);

  function undoWall() {
    const previous = wallHistory.at(-1);
    if (!previous) return;
    setWallHistory((history) => history.slice(0, -1));
    setSlots(previous);
    window.localStorage.setItem(WALL_KEY, JSON.stringify(previous));
    setTargetSlot(null);
    setMessage("Last wall change undone.");
  }

  function removeAlbum(index: number) {
    const album = slots[index];
    if (!album) return;
    const nextSlots = [...slots];
    nextSlots[index] = null;
    commitWall(nextSlots, `${album.title} removed from the wall.`);
    setTargetSlot(null);
    if (selected?.id === album.id) setDetailsOpen(false);
  }

  function downloadWall() {
    try {
      const blob = new Blob([exportWall(slots)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "vinyl-room-wall.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMessage("Wall exported to a JSON file.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export the wall.");
    }
  }

  async function loadWallFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 64_000) throw new Error("The wall file is too large.");
      const imported = importWall(await file.text());
      if (!commitWall(imported, "Wall imported. You can undo this change.")) setMessage("This wall is already arranged the same way.");
      setTargetSlot(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import the wall.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function playTrack(track: AlbumTrack) {
    if (!selected || playbackBusy) return;
    setPlaybackBusy(true);
    let revision = 0;
    try {
      const available = await refreshDevices();
      const target = chooseComputer(available, deviceId);
      if (!target) throw new Error("Open Spotify on your Mac, then try this track again.");
      setDeviceId(target.id);
      revision = markPlaybackChange({ trackUri: track.uri, playing: true });
      const response = await fetch("/api/spotify/play", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contextUri: selected.uri, trackUri: track.uri, deviceId: target.id }),
      });
      if (!response.ok) throw await responseError(response, "Spotify could not start this track.");
      setCurrentTrack({
        uri: track.uri,
        name: track.name,
        artist: track.artist,
        durationMs: track.durationMs,
        albumTitle: selected.title,
        albumUri: selected.uri,
      });
      setProgressMs(0);
      setPlaying(true);
      setDetailsOpen(false);
    } catch (error) {
      clearFailedPlaybackChange(revision);
      setMessage(error instanceof Error ? error.message : "The Spotify connection is currently unavailable.");
    } finally {
      setPlaybackBusy(false);
    }
  }

  async function loadMoreTracks() {
    if (!selected || tracksLoading || tracks.length >= trackTotal) return;
    const albumId = selected.id;
    setTracksLoading(true);
    try {
      const response = await fetch(`/api/spotify/albums/${albumId}/tracks?offset=${tracks.length}`, { cache: "no-store" });
      if (!response.ok) throw await responseError(response, "Could not load more tracks.");
      const data = (await response.json()) as { tracks: AlbumTrack[]; total: number };
      if (albumIdRef.current !== albumId) return;
      setTracks((current) => [...current, ...data.tracks]);
      setTrackTotal(data.total);
      setTracksError(null);
    } catch (error) {
      if (albumIdRef.current === albumId) setTracksError(error instanceof Error ? error.message : "Could not load more tracks.");
    } finally {
      if (albumIdRef.current === albumId) setTracksLoading(false);
    }
  }

  async function togglePlayback() {
    if (playbackBusy) return;
    if (!currentTrack) {
      setMessage("Choose a song from a wall album first.");
      return;
    }
    if (!deviceId) {
      setMessage("Open Spotify on your Mac, then choose a track again.");
      return;
    }
    setPlaybackBusy(true);
    const revision = markPlaybackChange({ playing: !playing });
    if (!playing) {
      try {
        let response = await fetch("/api/spotify/play", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId }),
        });
        if (!response.ok && /^spotify:album:[a-zA-Z0-9]{22}$/.test(currentTrack.albumUri)) {
          response = await fetch("/api/spotify/play", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              deviceId,
              contextUri: currentTrack.albumUri,
              trackUri: currentTrack.uri,
              positionMs: Math.min(progressMs, currentTrack.durationMs),
            }),
          });
        }
        if (response.ok) {
          setPlaying(true);
        } else {
          clearFailedPlaybackChange(revision);
          setMessage((await responseError(response, "Spotify could not start playback.")).message);
        }
      } catch {
        clearFailedPlaybackChange(revision);
        setMessage("The Spotify connection is currently unavailable.");
      } finally {
        setPlaybackBusy(false);
      }
      return;
    }
    try {
      const response = await fetch("/api/spotify/pause", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      if (response.ok) {
        setPlaying(false);
      } else {
        clearFailedPlaybackChange(revision);
        setMessage((await responseError(response, "Spotify could not pause playback.")).message);
      }
    } catch {
      clearFailedPlaybackChange(revision);
      setMessage("The Spotify connection is currently unavailable.");
    } finally {
      setPlaybackBusy(false);
    }
  }

  async function sendPlaybackControl(control: Record<string, unknown>) {
    if (!deviceId || !currentTrack || playbackBusy) return false;
    setPlaybackBusy(true);
    const revision = markPlaybackChange();
    try {
      const response = await fetch("/api/spotify/control", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...control, deviceId }),
      });
      if (!response.ok) throw await responseError(response, "Spotify could not update playback. Try again.");
      return true;
    } catch (error) {
      clearFailedPlaybackChange(revision);
      setMessage(error instanceof Error ? error.message : "Playback is currently unavailable.");
      return false;
    } finally {
      setPlaybackBusy(false);
    }
  }

  async function disconnectSpotify() {
    try {
      const response = await fetch("/api/spotify/logout", { method: "POST" });
      if (!response.ok) throw await responseError(response, "Could not disconnect Spotify.");
      ++playbackRevisionRef.current;
      pendingPlaybackRef.current = null;
      setConnected(false);
      setNeedsReconnect(false);
      setDevices([]);
      setDeviceId(null);
      setCurrentTrack(null);
      setPlaying(false);
      setDetailsOpen(false);
      setMessage("Spotify disconnected. Your wall stays in this room.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disconnect Spotify.");
    }
  }

  async function toggleShuffle() {
    const next = !shuffle;
    if (await sendPlaybackControl({ action: "shuffle", enabled: next })) setShuffle(next);
  }

  async function cycleRepeat() {
    const next = repeatMode === "off" ? "track" : repeatMode === "track" ? "context" : "off";
    if (await sendPlaybackControl({ action: "repeat", mode: next })) setRepeatMode(next);
  }

  async function skipTrack(direction: "next" | "previous") {
    if (await sendPlaybackControl({ action: direction })) setProgressMs(0);
  }

  async function seekTo(positionMs: number) {
    setSeekDraft(null);
    if (await sendPlaybackControl({ action: "seek", positionMs })) setProgressMs(positionMs);
  }

  function placeAlbum(album: RoomAlbum) {
    if (targetSlot === null) {
      setMessage("Choose a spot on the wall first.");
      return;
    }
    const nextSlots = slots.map((item, index) => index === targetSlot ? album : item);
    commitWall(nextSlots, `${album.title} is now on the wall.`);
    setTargetSlot(null);
  }

  const pageCount = Math.min(101, Math.max(1, Math.ceil(searchTotal / SEARCH_PAGE_SIZE)));
  const macDevices = computerDevices(devices);
  const currentDevice = macDevices.find((device) => device.id === deviceId) ?? null;

  return (
    <main className="vinyl-room">
      <Suspense fallback={<div className="scene-loading" role="status">Preparing the listening room…</div>}>
        <VinylRoomScene
          slots={slots}
          playing={playing}
          activeAlbumUri={currentTrack?.albumUri ?? null}
          onSlotClick={handleSlotClick}
          onSlotDrop={handleSlotDrop}
          onTonearmClick={() => void togglePlayback()}
          onBackgroundClick={() => setDetailsOpen(false)}
        />
      </Suspense>
      <div className="room-vignette" aria-hidden="true" />

      {(slots.some(Boolean) || currentTrack) && <div className="room-attribution" aria-label="Album artwork and metadata provided by Spotify"><span>CONTENT FROM</span><SpotifyLogo /></div>}

      <header className="room-header">
        <div className="room-brand"><Disc3 size={20} strokeWidth={1.3} /><span>VINYL <em>ROOM</em></span></div>
        <div className="room-header-center">YOUR PERSONAL LISTENING ROOM</div>
        {connected && needsReconnect ? (
          <a className="connect-link" href="/api/spotify/login" onClick={() => setConnected(false)}>RECONNECT SPOTIFY</a>
        ) : connected ? (
          <div className="spotify-connection">
            <span className="spotify-status" title={currentDevice?.name}><span className="status-dot" /><SpotifyLogo /> <span>{currentDevice ? `ON ${currentDevice.name.toUpperCase()}` : "OPEN ON MAC"}</span></span>
            <button className="spotify-disconnect" onClick={() => void disconnectSpotify()} title="Disconnect Spotify from Vinyl Room">Disconnect</button>
          </div>
        ) : (
          <a className="connect-link" href="/api/spotify/login"><span className="spotify-symbol">≋</span> CONNECT SPOTIFY</a>
        )}
      </header>

      {arranging && (
        <div className="room-hint">
          <span className="hint-line" />
          {targetSlot === null ? "CHOOSE A SPOT ON THE WALL" : `SPOT ${targetSlot + 1} SELECTED · CHOOSE AN ALBUM`}
          <span className="hint-line" />
        </div>
      )}

      {!connected && !arranging && !guideDismissed && (
        <aside className="setup-guide" aria-label="Getting started">
          <button className="guide-close" onClick={() => setGuideDismissed(true)} aria-label="Hide getting started guide"><X size={15} /></button>
          <small>GETTING STARTED</small>
          <h2>Your room is ready.</h2>
          <ol>
            <li>Connect your Spotify account.</li>
            <li>Open Spotify on this Mac and play a song once.</li>
            <li>Choose a wall album, then pick a track.</li>
          </ol>
          <a href="/api/spotify/login">Connect Spotify <ChevronRight size={14} /></a>
          <p>The room and your wall remain available without Spotify. Search and playback need a connection.</p>
        </aside>
      )}

      <footer className="room-footer">
        <div className={`current-record ${playerOpen ? "expanded" : ""}`}>
          <div className="current-record-main">
            <button className="record-expand" onClick={() => setPlayerOpen((open) => !open)} aria-expanded={playerOpen} aria-label={playerOpen ? "Close player controls" : "Open player controls"}>
              <span className={`record-indicator ${playing ? "spinning" : ""}`}><span /></span>
              <span className="record-copy">
                <small>{currentTrack ? playing ? "NOW PLAYING" : "READY TO PLAY" : "THE TURNTABLE IS WAITING"}</small>
                <strong>{currentTrack?.name ?? "Put on a record"}</strong>
                <span>{currentTrack ? `${currentTrack.albumTitle} · ${currentTrack.artist}` : "Find an album and make it yours"}</span>
              </span>
              {playerOpen ? <ChevronDown className="record-chevron" size={14} /> : <ChevronUp className="record-chevron" size={14} />}
            </button>
            {currentTrack && spotifyTrackUrl(currentTrack.uri) && <a className="track-source-link" href={spotifyTrackUrl(currentTrack.uri)!} target="_blank" rel="noopener noreferrer" aria-label={`Open ${currentTrack.name} on Spotify`} title="Open track on Spotify"><ExternalLink size={14} /></a>}
            <button className="transport-button" onClick={() => void togglePlayback()} disabled={!currentTrack || !deviceId || playbackBusy} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
          </div>
          {playerOpen && (
            <div className="player-expanded">
              <div className="player-time"><span>{trackDuration(seekDraft ?? progressMs)}</span><span>{trackDuration(currentTrack?.durationMs ?? 0)}</span></div>
              <input
                className="player-seek"
                type="range"
                min={0}
                max={Math.max(currentTrack?.durationMs ?? 1, 1)}
                value={Math.min(seekDraft ?? progressMs, Math.max(currentTrack?.durationMs ?? 1, 1))}
                disabled={!currentTrack || !deviceId || playbackBusy}
                aria-label="Seek within song"
                onChange={(event) => setSeekDraft(Number(event.currentTarget.value))}
                onPointerUp={(event) => void seekTo(Number(event.currentTarget.value))}
                onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) void seekTo(Number(event.currentTarget.value)); }}
              />
              <div className="player-controls">
                <button className={shuffle ? "active" : ""} onClick={() => void toggleShuffle()} disabled={!currentTrack || !deviceId || playbackBusy} aria-label={shuffle ? "Turn shuffle off" : "Turn shuffle on"} title="Shuffle"><Shuffle size={17} /></button>
                <button onClick={() => void skipTrack("previous")} disabled={!currentTrack || !deviceId || playbackBusy} aria-label="Previous song" title="Previous song"><SkipBack size={18} fill="currentColor" /></button>
                <button className="player-main-control" onClick={() => void togglePlayback()} disabled={!currentTrack || !deviceId || playbackBusy} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
                <button onClick={() => void skipTrack("next")} disabled={!currentTrack || !deviceId || playbackBusy} aria-label="Next song" title="Next song"><SkipForward size={18} fill="currentColor" /></button>
                <button className={repeatMode !== "off" ? "active" : ""} onClick={() => void cycleRepeat()} disabled={!currentTrack || !deviceId || playbackBusy} aria-label={`Repeat ${repeatMode}; click to change`} title={`Repeat: ${repeatMode}`}><Repeat2 size={18} />{repeatMode === "track" && <span className="repeat-badge">1</span>}</button>
              </div>
            </div>
          )}
        </div>
        <div className="wall-footer-actions">
          {wallHistory.length > 0 && <button className="wall-undo" onClick={undoWall} aria-label="Undo last wall change" title="Undo last wall change"><Undo2 size={16} /><span>UNDO</span></button>}
          <button className={`arrange-button ${arranging ? "active" : ""}`} onClick={() => {
            setArranging((value) => !value);
            setDetailsOpen(false);
            setTargetSlot(null);
          }}>
            {arranging ? <Check size={15} /> : <Plus size={15} />}
            {arranging ? "DONE" : "ARRANGE WALL"}
          </button>
        </div>
      </footer>

      {arranging && (
        <aside className="library-panel" aria-label="Search Spotify albums for the wall">
          <div className="panel-heading">
            <div><SpotifyLogo className="panel-spotify-logo" /><h2>Arrange the wall</h2></div>
            <button onClick={() => { setArranging(false); setTargetSlot(null); }} aria-label="Close"><X size={18} /></button>
          </div>
          <p className="panel-description">Choose a wall spot, then find an album. Your Spotify library is not changed.</p>
          <div className="wall-tools" role="group" aria-label="Wall tools">
            <button onClick={undoWall} disabled={wallHistory.length === 0} title="Undo last wall change"><Undo2 size={14} /> Undo</button>
            <button onClick={downloadWall} title="Export wall to a JSON file"><Download size={14} /> Export</button>
            <button onClick={() => importInputRef.current?.click()} title="Import a Vinyl Room wall file"><Upload size={14} /> Import</button>
            <input ref={importInputRef} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} onChange={(event) => void loadWallFile(event.currentTarget.files?.[0])} />
          </div>
          <div className="selected-wall-spot" aria-live="polite">
            {targetSlot === null ? <span>Select one of the eight wall spots to add or replace an album.</span> : (
              <>
                <span><strong>Spot {targetSlot + 1}</strong> · {slots[targetSlot]?.title ?? "Empty"}</span>
                {slots[targetSlot] && <button onClick={() => removeAlbum(targetSlot)} aria-label={`Remove ${slots[targetSlot]?.title} from spot ${targetSlot + 1}`}><Trash2 size={14} /> Remove</button>}
              </>
            )}
          </div>
          {!connected ? (
            <div className="panel-empty">
              <Music2 size={25} strokeWidth={1.3} />
              <p>Connect Spotify to search. Your existing wall stays available.</p>
              <a href="/api/spotify/login">Connect Spotify <ChevronRight size={14} /></a>
            </div>
          ) : (
            <>
              <label className="panel-search">
                <Search size={16} strokeWidth={1.7} />
                <input
                  type="search"
                  aria-label="Search albums or artists on Spotify"
                  placeholder="Album or artist"
                  value={searchQuery}
                  maxLength={100}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setSearchPage(0);
                    setSearchResults([]);
                    setSearchTotal(0);
                    setSearchError(null);
                    setSearchLoading(event.target.value.trim().length >= 2);
                  }}
                />
              </label>
              {searchQuery.trim().length < 2 ? (
                <div className="panel-empty"><p>Search for an album to put on your wall.</p></div>
              ) : searchLoading ? (
                <div className="search-loading" role="status" aria-live="polite"><span className="search-spinner" /> Searching Spotify for “{searchQuery.trim()}”…</div>
              ) : searchError ? (
                <div className="panel-empty"><p>{searchError}</p><button className="panel-retry" onClick={() => { setSearchLoading(true); setSearchRetryKey((value) => value + 1); }}>Try again</button></div>
              ) : searchResults.length === 0 ? (
                <div className="panel-empty"><p>No albums found for “{searchQuery.trim()}”. Try an artist name or shorter title.</p></div>
              ) : (
                <>
                  <p className="search-count" role="status">{searchPage * SEARCH_PAGE_SIZE + 1}–{searchPage * SEARCH_PAGE_SIZE + searchResults.length} of {searchTotal.toLocaleString()} albums</p>
                  <div className="panel-albums">
                    {searchResults.map((album) => (
                      <div className="album-result" key={album.id}>
                        <button onClick={() => placeAlbum(album)} disabled={targetSlot === null} title={targetSlot === null ? "Choose a wall spot first" : `Add ${album.title} by ${album.artist} to spot ${targetSlot + 1}`} aria-label={`Add ${album.title} by ${album.artist} to the selected wall spot`}>
                          {album.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={album.image} alt="" />
                          ) : <span className="panel-cover-placeholder" aria-hidden="true" />}
                          <strong title={album.title}>{album.title}</strong>
                          <small title={album.artist}>{album.artist}</small>
                        </button>
                        <a href={spotifyAlbumUrl(album)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${album.title} on Spotify`}>OPEN SPOTIFY <ExternalLink size={12} /></a>
                      </div>
                    ))}
                  </div>
                  <div className="panel-pagination">
                    <button onClick={() => { setSearchPage((page) => Math.max(0, page - 1)); setSearchLoading(true); }} disabled={searchPage === 0} aria-label="Previous albums"><ChevronLeft size={16} /></button>
                    <span>Page {searchPage + 1} of {pageCount}</span>
                    <button onClick={() => { setSearchPage((page) => Math.min(pageCount - 1, page + 1)); setSearchLoading(true); }} disabled={searchPage + 1 >= pageCount} aria-label="Next albums"><ChevronRight size={16} /></button>
                  </div>
                </>
              )}
            </>
          )}
        </aside>
      )}

      {detailsOpen && selected && !arranging && (
        <aside className="library-panel album-panel" ref={albumPanelRef} aria-label={`Tracks on ${selected.title}`}>
          <div className="panel-heading">
            <div><SpotifyLogo className="panel-spotify-logo" /><h2>{selected.title}</h2></div>
            <button onClick={() => {
              setDetailsOpen(false);
              const slot = activeSlotRef.current;
              if (slot !== null) window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-wall-slot="${slot}"]`)?.focus(), 0);
            }} aria-label="Close track list"><X size={18} /></button>
          </div>
          <div className="album-meta">
            {selected.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.image} alt="" />
            ) : <span className="album-meta-placeholder" aria-hidden="true" />}
            <div><span>{selected.artist}</span><small>{trackTotal ? `${trackTotal} TRACKS` : "SPOTIFY ALBUM"}</small></div>
          </div>
          <a className="album-source-link" href={spotifyAlbumUrl(selected)} target="_blank" rel="noopener noreferrer">OPEN ALBUM IN SPOTIFY <ExternalLink size={13} /></a>
          {connected && (
            <div className="album-player-status">
              <span>{needsReconnect
                ? "Reconnect Spotify once to allow device and playback status access."
                : currentDevice ? `Playback through Spotify on ${currentDevice.name}.`
                  : deviceError ?? "Open Spotify on your Mac to play this album."}</span>
              {needsReconnect ? <a href="/api/spotify/login" onClick={() => setConnected(false)}>Reconnect Spotify</a> : (
                <>
                  {macDevices.length > 1 && (
                    <select value={deviceId ?? ""} onChange={(event) => setDeviceId(event.target.value)} aria-label="Choose Spotify computer">
                      {macDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
                    </select>
                  )}
                  <button onClick={() => void refreshDevices().catch((error) => {
                    setDeviceError(error instanceof Error ? error.message : "Could not find your Spotify devices.");
                  })}>Refresh devices</button>
                </>
              )}
            </div>
          )}
          {tracksLoading && tracks.length === 0 ? (
            <div className="panel-empty"><p>Opening the record…</p></div>
          ) : tracksError && tracks.length === 0 ? (
            <div className="panel-empty"><p>{tracksError}</p></div>
          ) : tracks.length === 0 ? (
            <div className="panel-empty"><p>No tracks are available for this album.</p></div>
          ) : (
            <div className="album-track-list">
              {tracks.map((track) => (
                <button
                  key={track.id}
                  className={`album-track ${currentTrack?.uri === track.uri ? "active" : ""}`}
                  onClick={() => void playTrack(track)}
                  disabled={!track.playable || !connected || needsReconnect || playbackBusy}
                  aria-current={currentTrack?.uri === track.uri ? "true" : undefined}
                  title={track.playable ? `Play ${track.name}` : "Unavailable in your region"}
                >
                  <span className="album-track-number">{track.discNumber > 1 ? `${track.discNumber}.${track.trackNumber}` : track.trackNumber}</span>
                  <span className="album-track-title"><strong>{track.name}</strong><small>{track.artist}</small></span>
                  <span className="album-track-duration">{trackDuration(track.durationMs)}</span>
                </button>
              ))}
              {tracks.length < trackTotal && (
                <button className="album-load-more" onClick={() => void loadMoreTracks()} disabled={tracksLoading}>
                  {tracksLoading ? "Loading…" : "Show more tracks"}
                </button>
              )}
              {tracksError && <p className="album-track-error">{tracksError}</p>}
            </div>
          )}
        </aside>
      )}

      {message && <div className="room-toast" role="status"><span>{message}</span><button onClick={() => setMessage(null)} aria-label="Dismiss notification"><X size={15} /></button></div>}
    </main>
  );
}
