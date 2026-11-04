export type SpotifyCatalogAlbum = {
  id: string;
  name: string;
  uri: string;
  artists: Array<{ name: string }>;
  images: Array<{ url: string; width: number }>;
};

export function toRoomAlbum(album: SpotifyCatalogAlbum) {
  return {
    id: album.id,
    title: album.name,
    artist: album.artists.map((artist) => artist.name).join(", "),
    image: album.images.find((image) => image.width >= 300)?.url ?? album.images[0]?.url ?? "",
    uri: album.uri,
  };
}
