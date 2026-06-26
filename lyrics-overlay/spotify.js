const crypto = require('crypto');
const http = require('http');
const { shell } = require('electron');

// Spotify now requires the literal loopback IP (not "localhost") in redirect URIs.
// Register this EXACT URI in your Spotify Developer Dashboard app settings.
const REDIRECT_URI = 'http://127.0.0.1:8898/callback';
const SCOPES = 'user-read-currently-playing user-read-playback-state';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateVerifier() {
  return base64url(crypto.randomBytes(64));
}

function generateChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64url(hash);
}

// Opens the system browser for login, runs a one-shot local server to catch
// the redirect, then exchanges the code for tokens. Resolves with
// { access_token, refresh_token, expires_in }.
function startLogin(clientId) {
  return new Promise((resolve, reject) => {
    if (!clientId) {
      reject(new Error('Missing Spotify Client ID'));
      return;
    }
    const verifier = generateVerifier();
    const challenge = generateChallenge(verifier);
    const state = base64url(crypto.randomBytes(16));

    const server = http.createServer((req, res) => {
      let url;
      try {
        url = new URL(req.url, REDIRECT_URI);
      } catch {
        res.end('Bad request');
        return;
      }
      if (url.pathname !== '/callback') {
        res.statusCode = 404;
        res.end();
        return;
      }
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const err = url.searchParams.get('error');
      res.setHeader('Content-Type', 'text/html');

      if (err || !code || returnedState !== state) {
        res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>Spotify login failed.</h2><p>You can close this tab and try again.</p></body></html>');
        server.close();
        reject(new Error(err || 'Spotify auth failed or state mismatch'));
        return;
      }

      res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>Spotify connected ✅</h2><p>You can close this tab and go back to the overlay app.</p></body></html>');
      server.close();
      exchangeCode(clientId, code, verifier).then(resolve).catch(reject);
    });

    server.on('error', reject);

    server.listen(8898, '127.0.0.1', () => {
      const authUrl = new URL('https://accounts.spotify.com/authorize');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('scope', SCOPES);
      shell.openExternal(authUrl.toString());
    });

    // Don't hang forever if the user never completes login.
    setTimeout(() => {
      server.close();
    }, 5 * 60 * 1000);
  });
}

async function exchangeCode(clientId, code, verifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('Token exchange failed: ' + (await res.text()));
  return res.json();
}

async function refreshAccessToken(clientId, refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('Token refresh failed: ' + (await res.text()));
  return res.json();
}

// Returns null when nothing is playing, otherwise Spotify's currently-playing payload.
async function getCurrentlyPlaying(accessToken) {
  const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error('Spotify API error: ' + res.status);
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

module.exports = { startLogin, refreshAccessToken, getCurrentlyPlaying, REDIRECT_URI };
