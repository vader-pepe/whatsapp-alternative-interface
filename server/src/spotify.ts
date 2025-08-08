import axios from "axios";
import { env } from "@/common/utils/envConfig";
import { spotify } from ".";

interface Player {
  device: Device;
  repeat_state: string;
  shuffle_state: boolean;
  context: Context;
  timestamp: number;
  progress_ms: number;
  is_playing: boolean;
  item: Item;
  currently_playing_type: string;
  actions: Actions;
};

interface Actions {
  interrupting_playback: boolean;
  pausing: boolean;
  resuming: boolean;
  seeking: boolean;
  skipping_next: boolean;
  skipping_prev: boolean;
  toggling_repeat_context: boolean;
  toggling_shuffle: boolean;
  toggling_repeat_track: boolean;
  transferring_playback: boolean;
};

interface Context {
  type: string;
  href: string;
  external_urls: ExternalUrls;
  uri: string;
};

interface ExternalUrls {
  spotify: string;
};

interface Device {
  id: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number;
  supports_volume: boolean;
};

interface Item {
  album: Album;
  artists: Artist[];
  available_markets: string[];
  disc_number: number;
  duration_ms: number;
  explicit: boolean;
  external_ids: ExternalIDS;
  external_urls: ExternalUrls;
  href: string;
  id: string;
  is_playable: boolean;
  linked_from: LinkedFrom;
  restrictions: Restrictions;
  name: string;
  popularity: number;
  preview_url: string;
  track_number: number;
  type: string;
  uri: string;
  is_local: boolean;
};

interface Album {
  album_type: string;
  total_tracks: number;
  available_markets: string[];
  external_urls: ExternalUrls;
  href: string;
  id: string;
  images: Image[];
  name: string;
  release_date: string;
  release_date_precision: string;
  restrictions: Restrictions;
  type: string;
  uri: string;
  artists: Artist[];
};

interface Artist {
  external_urls: ExternalUrls;
  href: string;
  id: string;
  name: string;
  type: string;
  uri: string;
};

interface Image {
  url: string;
  height: number;
  width: number;
};

interface Restrictions {
  reason: string;
};

interface ExternalIDS {
  isrc: string;
  ean: string;
  upc: string;
};

interface LinkedFrom {
};

export async function getNowPlaying() {
  const token = (await getAccessToken()).access_token;
  const res = await axios.get<Player>('https://api.spotify.com/v1/me/player', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return res.data;
};

interface Response {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

async function getAccessToken(): Promise<Response> {
  const cachedToken = spotify.getCachedToken();
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && now - cachedToken.updated_at < 3600) {
    return {
      access_token: cachedToken.access_token,
      expires_in: cachedToken.expires_in,
      token_type: cachedToken.token_type,
    };
  }

  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.SPOTIFY_REFRESH_TOKEN,
      client_id: env.SPOTIFY_CLIENT_ID!,
      client_secret: env.SPOTIFY_CLIENT_SECRET!
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  spotify.setToken({ ...response.data, updated_at: now });
  return response.data;
};

export async function pollNowPlaying(handleTrack: () => Promise<void>) {
  const data = await getNowPlaying();
  if (data.is_playing) {
    const remaining = data.item.duration_ms - data.progress_ms;
    // handleTrack(data.item); // your handler
    await handleTrack();
    setTimeout(pollNowPlaying, remaining + 1000);
  } else {
    setTimeout(pollNowPlaying, 30000);
  }
};
