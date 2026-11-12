// `npm run share:online`: run DineTogether on one port and open a free Cloudflare quick tunnel,
// so friends can join from any network (Wi-Fi or mobile data) with an https:// link.
// Anyone with the link can open the app while this is running. Press Ctrl+C to stop sharing.
import { Tunnel } from 'cloudflared';

const PORT = Number(process.env.PORT || 8791);
const MAX_TRIES = 3;
process.env.PORT = String(PORT);
await import('../server/index.mjs');

// Real quick-tunnel links are random words, e.g. https://plans-nearby-enhance.trycloudflare.com.
// "api.trycloudflare.com" only shows up inside error messages, so it must never be printed as a link.
const isRealLink = (url) => /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(url) && !url.startsWith('https://api.');

let tunnel = null;
let stopping = false;

function start(attempt) {
  console.log(`\n  Opening a public link via Cloudflare…${attempt > 1 ? ` (try ${attempt} of ${MAX_TRIES})` : ''}`);
  let lastError = '';
  let gotLink = false;
  tunnel = Tunnel.quick(`http://localhost:${PORT}`);

  tunnel.on('stderr', (line) => {
    const m = String(line).match(/(failed to [^\n]*|ERR [^\n]*)/i);
    if (m) lastError = m[1].trim();
  });
  tunnel.on('url', (url) => {
    if (gotLink || !isRealLink(url)) return;
    gotLink = true;
    process.env.DT_PUBLIC_URL = url; // the Invite button now hands out this link
    const line = '─'.repeat(url.length + 4);
    console.log(`\n  ┌${line}┐\n  │  ${url}  │\n  └${line}┘`);
    console.log('  Share this link. It works on any network while this window stays open.');
    console.log(`  On this computer you can also use http://localhost:${PORT}\n`);
  });
  tunnel.once('connected', () => console.log('  Tunnel connected ✓'));
  tunnel.on('exit', (code) => {
    if (stopping) return;
    delete process.env.DT_PUBLIC_URL;
    if (!gotLink && attempt < MAX_TRIES) {
      console.log(`  Couldn't open the tunnel${lastError ? `: ${lastError}` : ''}. Retrying in 5 seconds…`);
      setTimeout(() => start(attempt + 1), 5000);
      return;
    }
    if (!gotLink) {
      console.log(`\n  ✗ Could not create a public link${lastError ? `:\n    ${lastError}` : ''}`);
      console.log('    This computer can’t reach Cloudflare’s tunnel service (api.trycloudflare.com).');
      console.log('    Usually the network blocks it (common on office/guest Wi-Fi), or Cloudflare is busy.');
      console.log('    Try again on another network you’re allowed to use (e.g. home Wi-Fi or a phone hotspot),');
      console.log('    or share on the same Wi-Fi instead: npm run share (see README).');
      console.log(`\n  The app is still running on this computer: http://localhost:${PORT}  (Ctrl+C to stop)\n`);
    } else {
      console.log(`\n  Tunnel closed (code ${code}). The public link no longer works.`);
      console.log(`  The app is still running on this computer: http://localhost:${PORT}. Run the command again for a new link.\n`);
    }
  });
}

start(1);

const stop = () => { stopping = true; console.log('\n  Stopping…'); tunnel?.stop(); setTimeout(() => process.exit(0), 1500); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
