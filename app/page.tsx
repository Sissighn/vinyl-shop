"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Disc3, Music2, Pause, Play, Plus, Repeat2, Search, Shuffle, SkipBack, SkipForward, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import VinylRoomScene, { type RoomAlbum } from "@/components/vinyl-room-scene";

const EMPTY_SLOTS: (RoomAlbum | null)[] = Array.from({ length: 8 }, () => null);
const WALL_KEY = "vinyl-room-wall-v2";

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

function isRoomAlbum(value: unknown): value is RoomAlbum {
  if (!value || typeof value !== "object") return false;
  const album = value as Record<string, unknown>;
  return typeof album.id === "string" && typeof album.title === "string" &&
    typeof album.artist === "string" && typeof album.image === "string" &&
    album.uri === `spotify:album:${album.id}`;
}

export default function Home() {
  const [slots, setSlots] = useState<(RoomAlbum | null)[]>(EMPTY_SLOTS);
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
  const [searchResults, setSearchResults] = useState<RoomAlbum[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const albumIdRef = useRef<string | null>(null);
  const albumPanelRef = useRef<HTMLElement | null>(null);

  const refreshDevices = useCallback(async () => {
    const response = await fetch("/api/spotify/devices", { cache: "no-store" });
    if (response.status === 401 || response.status === 403) {
      setNeedsReconnect(true);
      throw new Error("Reconnect Spotify to allow Mac playback controls.");
    }
    if (!response.ok) throw new Error("Could not find your Spotify devices. Try again.");
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
    const update = () => {
      void refreshDevices().catch((error) => {
        if (active) setDeviceError(error instanceof Error ? error.message : "Could not find your Spotify devices.");
      });
    };
    update();
    const timer = window.setInterval(update, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [connected, needsReconnect, refreshDevices]);

  useEffect(() => {
    if (!connected || !deviceId) return;
    let active = true;
    const syncPlayback = async () => {
      try {
        const response = await fetch("/api/spotify/playback-state", { cache: "no-store" });
        if (!response.ok) return;
        const state = (await response.json()) as PlaybackState;
        if (!active) return;
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
        // Keep the last known state during a temporary network interruption.
      }
    };
    const firstCheck = window.setTimeout(() => void syncPlayback(), 300);
    const timer = window.setInterval(() => void syncPlayback(), 3000);
    return () => { active = false; window.clearTimeout(firstCheck); window.clearInterval(timer); };
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
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDetailsOpen(false); };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [detailsOpen]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
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
          if (Array.isArray(saved) && saved.length === 8 && saved.every((item) => item === null || isRoomAlbum(item))) {
            setSlots(saved);
          }
        } catch { /* Ignore an invalid local wall. */ }
      }

      try {
        const response = await fetch("/api/spotify/session", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { connected: boolean };
        if (!data.connected) return;
        setConnected(true);
        if (storedWall) return;

        const oldWall = window.localStorage.getItem("vinyl-room-wall-v1");
        if (!oldWall) return;
        const savedIds = JSON.parse(oldWall) as unknown;
        if (!Array.isArray(savedIds) || savedIds.length !== 8) return;
        const ids = [...new Set(savedIds.filter((id): id is string => typeof id === "string"))];
        if (ids.length === 0) return;
        const albumsResponse = await fetch(`/api/spotify/albums?ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" });
        if (!albumsResponse.ok) return;
        const { albums } = (await albumsResponse.json()) as { albums: RoomAlbum[] };
        const restored = savedIds.map((id) => albums.find((album) => album.id === id) ?? null);
        setSlots(restored);
        window.localStorage.setItem(WALL_KEY, JSON.stringify(restored));
      } catch {
        // The room stays visible while Spotify is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!arranging || !connected || searchQuery.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: searchQuery.trim(), offset: String(searchPage * 4) });
        const response = await fetch(`/api/spotify/search?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? "Reconnect Spotify to search." : "Search is unavailable. Try again.");
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
  }, [arranging, connected, searchQuery, searchPage]);

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
        if (!response.ok) throw new Error("Could not load this album's tracks.");
        const data = (await response.json()) as { tracks: AlbumTrack[]; total: number };
        setTracks(data.tracks);
        setTrackTotal(data.total);
        setTracksError(null);
      } catch {
        if (!controller.signal.aborted) setTracksError("Could not load this album's tracks.");
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
    setDetailsOpen(true);
  }, [arranging, selected, slots]);

  const handleSlotDrop = useCallback((from: number, to: number) => {
    if (from === to || !slots[from]) return;
    const nextSlots = [...slots];
    [nextSlots[from], nextSlots[to]] = [nextSlots[to], nextSlots[from]];
    setSlots(nextSlots);
    window.localStorage.setItem(WALL_KEY, JSON.stringify(nextSlots));
    setDetailsOpen(false);
    setTargetSlot(null);
  }, [slots]);

  async function playTrack(track: AlbumTrack) {
    if (!selected || playbackBusy) return;
    setPlaybackBusy(true);
    try {
      const available = await refreshDevices();
      const target = chooseComputer(available, deviceId);
      if (!target) throw new Error("Open Spotify on your Mac, then try this track again.");
      setDeviceId(target.id);
      const response = await fetch("/api/spotify/play", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contextUri: selected.uri, trackUri: track.uri, deviceId: target.id }),
      });
      if (!response.ok) throw new Error(response.status === 404
        ? "Spotify on your Mac is not available. Open it and try again."
        : response.status === 403 ? "Spotify Premium is required to control playback."
          : "Spotify could not start this track.");
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
      if (!response.ok) throw new Error("Could not load more tracks.");
      const data = (await response.json()) as { tracks: AlbumTrack[]; total: number };
      if (albumIdRef.current !== albumId) return;
      setTracks((current) => [...current, ...data.tracks]);
      setTrackTotal(data.total);
      setTracksError(null);
    } catch {
      if (albumIdRef.current === albumId) setTracksError("Could not load more tracks.");
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
        } else setMessage(response.status === 404
          ? "Spotify on your Mac is not available. Open it and try again."
          : response.status === 403 ? "Spotify refused playback on this device. Check Spotify Premium and the active device."
            : "Spotify could not start playback.");
      } catch {
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
      } else setMessage("Spotify could not pause playback.");
    } catch {
      setMessage("The Spotify connection is currently unavailable.");
    } finally {
      setPlaybackBusy(false);
    }
  }

  async function sendPlaybackControl(control: Record<string, unknown>) {
    if (!deviceId || !currentTrack || playbackBusy) return false;
    setPlaybackBusy(true);
    try {
      const response = await fetch("/api/spotify/control", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...control, deviceId }),
      });
      if (!response.ok) throw new Error(response.status === 403
        ? "Spotify Premium is required for this control."
        : "Spotify could not update playback. Try again.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Playback is currently unavailable.");
      return false;
    } finally {
      setPlaybackBusy(false);
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
    setSlots(nextSlots);
    window.localStorage.setItem(WALL_KEY, JSON.stringify(nextSlots));
    setTargetSlot(null);
    setMessage(`${album.title} is now on the wall.`);
  }

  const pageCount = Math.min(250, Math.max(1, Math.ceil(searchTotal / 4)));
  const macDevices = computerDevices(devices);
  const currentDevice = macDevices.find((device) => device.id === deviceId) ?? null;

  return (
    <main className="vinyl-room">
      <VinylRoomScene
        slots={slots}
        playing={playing}
        activeAlbumUri={currentTrack?.albumUri ?? null}
        onSlotClick={handleSlotClick}
        onSlotDrop={handleSlotDrop}
        onTonearmClick={() => void togglePlayback()}
        onBackgroundClick={() => setDetailsOpen(false)}
      />
      <div className="room-vignette" aria-hidden="true" />

      <header className="room-header">
        <div className="room-brand"><Disc3 size={20} strokeWidth={1.3} /><span>VINYL <em>ROOM</em></span></div>
        <div className="room-header-center">YOUR PERSONAL LISTENING ROOM</div>
        {connected && needsReconnect ? (
          <a className="connect-link" href="/api/spotify/login" onClick={() => setConnected(false)}>RECONNECT SPOTIFY</a>
        ) : connected ? (
          <span className="spotify-status" title={currentDevice?.name}><span /> {currentDevice ? `SPOTIFY ON ${currentDevice.name.toUpperCase()}` : "OPEN SPOTIFY ON MAC"}</span>
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
        <button className={`arrange-button ${arranging ? "active" : ""}`} onClick={() => {
          setArranging((value) => !value);
          setDetailsOpen(false);
          setTargetSlot(null);
        }}>
          {arranging ? <Check size={15} /> : <Plus size={15} />}
          {arranging ? "DONE" : "ARRANGE WALL"}
        </button>
      </footer>

      {arranging && (
        <aside className="library-panel" aria-label="Search Spotify albums for the wall">
          <div className="panel-heading">
            <div><small>SPOTIFY CATALOG</small><h2>Arrange the wall</h2></div>
            <button onClick={() => { setArranging(false); setTargetSlot(null); }} aria-label="Close"><X size={18} /></button>
          </div>
          <p className="panel-description">Choose a wall spot, search any album on Spotify, then click it to add. Nothing is saved to your Spotify library.</p>
          {!connected ? (
            <div className="panel-empty">
              <Music2 size={25} strokeWidth={1.3} />
              <p>Connect Spotify to search for albums.</p>
              <a href="/api/spotify/login">Connect Spotify <ChevronRight size={14} /></a>
            </div>
          ) : (
            <>
              <label className="panel-search">
                <Search size={16} strokeWidth={1.7} />
                <input
                  type="search"
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
                <div className="panel-empty"><p>Searching Spotify…</p></div>
              ) : searchError ? (
                <div className="panel-empty"><p>{searchError}</p></div>
              ) : searchResults.length === 0 ? (
                <div className="panel-empty"><p>No albums found. Try another search.</p></div>
              ) : (
                <>
                  <div className="panel-albums">
                    {searchResults.map((album) => (
                      <button key={album.id} onClick={() => placeAlbum(album)} title={`${album.title} — ${album.artist}`}>
                        {album.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={album.image} alt="" />
                        ) : <span className="panel-cover-placeholder" aria-hidden="true" />}
                        <span>{album.title}</span>
                        <small>{album.artist}</small>
                      </button>
                    ))}
                  </div>
                  <div className="panel-pagination">
                    <button onClick={() => { setSearchPage((page) => Math.max(0, page - 1)); setSearchLoading(true); }} disabled={searchPage === 0} aria-label="Previous albums"><ChevronLeft size={16} /></button>
                    <span>{searchPage + 1} / {pageCount}</span>
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
            <div><small>ALBUM TRACKS</small><h2>{selected.title}</h2></div>
            <button onClick={() => setDetailsOpen(false)} aria-label="Close track list"><X size={18} /></button>
          </div>
          <div className="album-meta">
            {selected.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.image} alt="" />
            ) : <span className="album-meta-placeholder" aria-hidden="true" />}
            <div><span>{selected.artist}</span><small>{trackTotal ? `${trackTotal} TRACKS` : "SPOTIFY ALBUM"}</small></div>
          </div>
          <p className="panel-description">Choose a song to start from that point in the album.</p>
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

      {message && <button className="room-toast" onClick={() => setMessage(null)}><span>{message}</span><X size={15} /></button>}
    </main>
  );
}
