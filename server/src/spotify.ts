import axios from "axios";
import { env } from "@/common/utils/envConfig";
import { spotify } from ".";

export async function getNowPlayingUri(): Promise<string> {
  const token = (await getAccessToken()).access_token;
  const res = await axios.get('https://api.spotify.com/v1/me/player', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return res.data.item.uri as string;
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
