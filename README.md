# Vinyl Room

![Vinyl Room with empty album shelves](docs/vinyl-room-empty.png)

A personal, interactive 3D room for your records. A fixed camera frames a wall with eight album spots, a wide wooden console, two speakers, and a turntable. The room fills the browser window without page scrolling.

The album spots start empty. Search Spotify's catalog to put any album on your wall—no need to save it to your Spotify library. Drag a cover onto another wall spot to move or swap albums, or use the keyboard controls. Remove or replace an album, undo the last wall change, and export or import your arrangement as JSON. Click a wall album to browse its track list without interrupting the current song; playback changes only when you choose a new track. Click outside the track list to close it.

![Vinyl Room with albums arranged on the wall](docs/vinyl-room-collection.png)

## Download for macOS

[Open the locally built Apple Silicon DMG](release/Vinyl-Room-0.4.1-arm64.dmg)

The DMG is generated in the ignored `release/` folder. For a working download on GitHub, upload that file to a GitHub Release and replace this local link with the release asset URL. The app is not Apple-notarized, so macOS may ask you to confirm opening it in **System Settings → Privacy & Security**.

Open Spotify on your Mac before choosing a song in Vinyl Room. Vinyl Room controls that Spotify app and reads its playback status; it does not stream protected audio inside Electron. If your Mac does not appear as a device, play any song briefly in Spotify, then use **Refresh devices** in the album panel. The room and your saved wall remain usable without a connection; catalog search and playback require Spotify. Quit another running Vinyl Room instance first, since both use the same local port.

The tonearm acts as a play/pause switch: on the record while playing, parked beside it while paused. The compact player at bottom left expands when clicked, offering song scrubbing, previous/next, shuffle, and repeat (off → song → album).

Use **Disconnect** in the top right to remove Vinyl Room's local Spotify session. Your wall layout remains on this Mac. Export your wall before clearing app data or moving to another Mac, then import its JSON file in **Arrange Wall**. You can reconnect at any time. Disconnecting does not revoke the authorization in your Spotify account settings.

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

## Verify a change

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run desktop:build:web
```

The web and desktop builds use separate output folders (`dist/` and `.next-desktop/`). The tests cover Spotify request boundaries, token refresh, rate-limit handling, playback-state reconciliation, and wall file validation. No Spotify credentials are needed to run them.

## Set up Spotify

For the website, add `http://127.0.0.1:5173/api/spotify/callback` as another redirect URI in Spotify Developer Dashboard. Set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env.local`. The web build uses server-side HTTP-only cookies. The desktop app uses PKCE and needs only the Client ID.

Vinyl Room requests Spotify's playback read/write scopes and the profile scope needed for catalog search. Access tokens stay in HTTP-only cookies and are not exposed through an app API. Playback requests require a same-origin browser request. The Electron window uses sandboxing, context isolation, a restricted navigation policy, denied permissions, and a content security policy. Spotify rate limits and temporary outages surface as recoverable errors; the playback display backs off and resynchronizes with Spotify.

## Interactions

- Click an album on the wall to open its track list; click a song to play from that point in the album through Spotify on your Mac.
- Open **Arrange Wall**, click a wall spot, search for an album, then click a result to add it. Nothing is saved to your Spotify library.
- Search shows ten albums per page with loading, result count, pagination, and retry states. Each result and opened album links to its original Spotify page.
- To move or swap albums with the keyboard, focus a wall spot, press Space to pick up its record, move with the arrow keys, then press Enter or Space to drop. Escape cancels. Enter opens an album; Escape closes its track list.
- Select an occupied spot in **Arrange Wall** to remove or replace its album. **Undo** restores the last change. **Export** downloads a wall JSON file; **Import** restores one. The wall also saves locally after each change.
- Use the playback button at the bottom left to pause or resume. The 3D record follows Spotify's reported playback state, including pauses made in Spotify.
- The player, track list, search, wall tools, and links are keyboard accessible. Focus outlines and reduced-motion settings are supported.

## Technology

- React 19, TypeScript, and App Router on Vinext
- Three.js for WebGL geometry, lighting, and animation
- Server routes for Spotify OAuth, catalog search, and playback
- Electron and a bundled Next.js server for the native macOS app
- Spotify Connect and Web API for Mac playback control and status

The 3D scene updates only changed album sleeves and stops rendering when idle or hidden. Its materials, lighting, vinyl grooves, and tonearm provide depth without animated album artwork. No album covers are generated: covers and album metadata come from Spotify, with links back to the original content and Spotify attribution.
