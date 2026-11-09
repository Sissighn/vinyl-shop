export function SpotifyLogo({ className = "" }: { className?: string }) {
  return (
    // Official unmodified white Spotify logo, downloaded from the Spotify design resources.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src="/spotify-logo.svg" alt="Spotify" width="80" height="22" />
  );
}
