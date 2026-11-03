"use client";

import { useEffect, useRef, useState } from "react";

type PlayerError = { message: string };
type PlayerDevice = { device_id: string };
type PlayerState = { paused: boolean } | null;

type SpotifyPlayer = {
  addListener(event: "ready" | "not_ready", callback: (device: PlayerDevice) => void): void;
  addListener(event: "initialization_error" | "authentication_error" | "account_error" | "playback_error", callback: (error: PlayerError) => void): void;
  addListener(event: "player_state_changed", callback: (state: PlayerState) => void): void;
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement(): Promise<void>;
};

declare global {
  interface Window {
    Spotify?: { Player: new (options: {
      name: string;
      getOAuthToken: (callback: (token: string) => void) => void;
      volume: number;
    }) => SpotifyPlayer };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export function useSpotifyPlayer(connected: boolean, onPlayingChange: (playing: boolean) => void) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const onPlayingChangeRef = useRef(onPlayingChange);

  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  }, [onPlayingChange]);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    let player: SpotifyPlayer | null = null;

    const initialize = () => {
      if (!active || !window.Spotify || player) return;
      player = new window.Spotify.Player({
        name: "Vinyl Room",
        volume: 0.7,
        getOAuthToken: (callback) => {
          void fetch("/api/spotify/player-token", { cache: "no-store" })
            .then(async (response) => {
              if (!response.ok) throw new Error("Reconnect Spotify to enable in-app playback.");
              const data = (await response.json()) as { accessToken: string };
              callback(data.accessToken);
            })
            .catch(() => { if (active) setError("Reconnect Spotify to enable in-app playback."); });
        },
      });
      playerRef.current = player;
      player.addListener("ready", ({ device_id }) => {
        if (!active) return;
        setDeviceId(device_id);
        setError(null);
      });
      player.addListener("not_ready", () => {
        if (active) {
          setDeviceId(null);
          onPlayingChangeRef.current(false);
        }
      });
      player.addListener("player_state_changed", (state) => {
        if (active) onPlayingChangeRef.current(state ? !state.paused : false);
      });
      player.addListener("initialization_error", () => {
        if (active) {
          setError("This app build cannot play protected Spotify audio.");
          onPlayingChangeRef.current(false);
        }
      });
      player.addListener("authentication_error", () => {
        if (active) {
          setError("Reconnect Spotify to grant in-app playback access.");
          onPlayingChangeRef.current(false);
        }
      });
      player.addListener("account_error", () => {
        if (active) {
          setError("Spotify Premium is required for in-app playback.");
          onPlayingChangeRef.current(false);
        }
      });
      player.addListener("playback_error", ({ message }) => {
        if (active) {
          setError(`Spotify playback failed: ${message}`);
          onPlayingChangeRef.current(false);
        }
      });
      void player.connect().then((success) => {
        if (active && !success) setError("Could not connect the Vinyl Room player.");
      }).catch(() => {
        if (active) setError("Could not connect the Vinyl Room player.");
      });
    };

    window.onSpotifyWebPlaybackSDKReady = initialize;
    if (window.Spotify) initialize();
    else {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      script.dataset.vinylSpotifySdk = "1";
      script.onerror = () => { if (active) setError("Could not load Spotify's playback SDK."); };
      document.body.appendChild(script);
    }

    return () => {
      active = false;
      window.onSpotifyWebPlaybackSDKReady = undefined;
      player?.disconnect();
      playerRef.current = null;
      document.querySelector("script[data-vinyl-spotify-sdk]")?.remove();
    };
  }, [connected]);

  return {
    deviceId,
    error,
    activate: () => playerRef.current?.activateElement(),
  };
}
