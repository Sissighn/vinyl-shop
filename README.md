# Vinyl Room

A personal, interactive 3D room for your records. A fixed camera frames a wall with eight album spots, a wide wooden console, two speakers, and a turntable. The room fills the browser window without page scrolling.

The album spots start empty. Search Spotify's catalog to put any album on your wall—no need to save it to your Spotify library. Drag a cover onto another wall spot to move or swap albums. Click a wall album to browse its track list without interrupting the current song; playback changes only when you choose a new track. Click outside the track list to close it.

## Download for macOS

[Download Vinyl Room for Apple Silicon (DMG)](release/Vinyl-Room-0.4.1-arm64.dmg)

Open Spotify on your Mac before choosing a song in Vinyl Room. Vinyl Room controls that Spotify app and reads its playback status; it no longer streams protected audio inside Electron. If your Mac does not appear as a device, play any song briefly in Spotify, then use **Refresh devices** in the album panel. Reconnect Spotify once if Vinyl Room asks for the additional playback-status permission. Quit the older **Vinyl Room Preview** first, since both apps use the same local port. The old DRM preview is retained in `release/drm-preview` for reference, but is not recommended for listening because it may rapidly skip tracks.

The tonearm acts as a play/pause switch: on the record while playing, parked beside it while paused. The compact player at bottom left expands when clicked, offering song scrubbing, previous/next, shuffle, and repeat (off → song → album).

This download is currently a **local build in this project folder**. The GitHub repository has no commits or uploads yet, so the link will not work on GitHub until you choose to publish a release. The DMG is not Apple-notarized; macOS may ask you to confirm opening it in **System Settings → Privacy & Security**.

Open the DMG and drag **Vinyl Room** to Applications. On first launch, the app asks for a Spotify Client ID. Create a Spotify app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), select **Web API** (not iOS), add `http://127.0.0.1:17873/api/spotify/callback` as its redirect URI, and paste its Client ID into Vinyl Room. Do not paste a Client Secret. Spotify sign-in opens in your default browser and returns you to the app.

Spotify Premium is required for playback. Spotify development-mode apps also limit which accounts may use them.

To rebuild the local Apple Silicon DMG:

```bash
npm install
npm run desktop:package
```

## Run the website locally

Requires Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open `http://127.0.0.1:5173`.

## Set up Spotify

For the website, add `http://127.0.0.1:5173/api/spotify/callback` as another redirect URI in Spotify Developer Dashboard. Set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env.local`. The web build uses server-side HTTP-only cookies. The desktop app uses PKCE and needs only the Client ID.

## Interactions

- Click an album on the wall to open its track list; click a song to play from that point in the album through Spotify on your Mac.
- Open **Arrange Wall**, click a wall spot, search for an album, then click a result to add it. Nothing is saved to your Spotify library.
- Your wall arrangement is saved in the browser.
- Use the playback button at the bottom left to pause or resume. The 3D record follows Spotify's reported playback state, including pauses made in Spotify.

## Technology

- React 19, TypeScript, and App Router on Vinext
- Three.js for WebGL geometry, lighting, and animation
- Server routes for Spotify OAuth, catalog search, and playback
- Electron and a bundled Next.js server for the native macOS app
- Spotify Connect and Web API for Mac playback control and status

No album covers are generated. The Git repository remains without commits or pushes until you decide otherwise.
