import { google } from "googleapis";
import type { OAuthTokens } from "./types";

const scopes = ["openid", "email", "profile", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"];
export function createOAuthClient() { return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI); }
export function getGoogleAuthUrl(state: string): string { return createOAuthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: scopes, state }); }
export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> { const { tokens } = await createOAuthClient().getToken(code); return { accessToken: tokens.access_token ?? "", refreshToken: tokens.refresh_token ?? undefined, expiresAt: new Date(tokens.expiry_date ?? Date.now()), scopes }; }
export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> { const client = createOAuthClient(); client.setCredentials({ refresh_token: refreshToken }); const { credentials } = await client.refreshAccessToken(); return { accessToken: credentials.access_token ?? "", refreshToken, expiresAt: new Date(credentials.expiry_date ?? Date.now()), scopes }; }
