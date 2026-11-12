# DineTogether

Plan a group dinner together. Everyone opens the link on their own phone, enters their name and picks a food from the ones available within 12 km. The "Current preferences" panel shows who chose what, the totals and the counts, and updates live for everyone.

## Run it

```bash
npm install
npm run dev
```

- App: http://localhost:5173 (the API runs on port 8791 behind Vite's proxy)
- Tests: `npm test` (cost calculations) · Type check: `npm run typecheck`

## Put it online for everyone (Render, free)

GitHub stores the code. Render runs it and gives you a permanent link like `https://dinetogether.onrender.com`.

1. Sign in at https://render.com with your GitHub account.
2. Click **New → Blueprint**, pick this repository, then **Apply**. Render reads `render.yaml`, runs `npm ci && npm run build`, then `npm start`.
3. Wait for the deploy to finish (about 3–5 minutes), then open the `onrender.com` link and share it.

Free-plan limits:
- The app **sleeps after 15 minutes with no visitors**. The next visit wakes it up in about 30–60 seconds.
- Free Render servers have **no permanent disk**. Dinner groups are wiped whenever the app sleeps, restarts or is redeployed. That's fine for planning tonight's dinner, but don't rely on it for anything you need to keep. For permanent storage, add a Render Disk (paid) mounted at `/opt/render/project/src/data`.
- Every `git push` to the main branch redeploys automatically.

## Share with friends anywhere (public link)

```bash
npm run share:online
```

This builds the app, starts it on port 8791 and opens a free **Cloudflare quick tunnel**. No account or firewall changes are needed. It prints a link like `https://some-words.trycloudflare.com`, and the **Invite** button hands out that link automatically.

- It works on any Wi-Fi or mobile data, and because it's https, phones can use "Use my location".
- **Anyone with the link can open the app** while it's running. Press **Ctrl+C** to stop sharing.
- You get a new random link each time you start it.
- Stop `npm run dev` first, since both use port 8791.
- Through the tunnel, updates show up within about 3 seconds. Cloudflare holds back the instant live stream, so the page checks for changes instead.

## Share on the same Wi-Fi (IP address)

Run the app, then press **Invite**. When you're on `localhost`, the link automatically uses this computer's Wi-Fi IP (e.g. `http://192.168.167.104:5173/g/abc123`).

For a single port that's easy to share:

```bash
npm run share
```

This builds the app and serves everything on port **8791**, then prints the link to send, e.g. `http://192.168.167.104:8791`.

**For friends to be able to open it:**
1. They must be on the **same Wi-Fi** as this computer. Many office or guest networks block devices from reaching each other. If yours does, use a phone hotspot or home Wi-Fi.
2. **Windows Firewall must allow Node.js.** On a network marked *Public*, Windows blocks incoming connections to Node by default. Either:
   - mark your Wi-Fi as **Private** (Settings → Network & internet → Wi-Fi → your network → *Private network*), **and** allow the ports with this command in an **Administrator** PowerShell:
     ```powershell
     New-NetFirewallRule -DisplayName "DineTogether" -Direction Inbound -Protocol TCP -LocalPort 5173,8791 -Action Allow -Profile Private
     ```
   - or, when Windows shows "Allow Node.js to communicate on these networks", tick **Private networks**.
3. Their phone's location isn't needed. The person who starts the dinner sets the area once.
- Tests: `npm test` (cost calculations) · Type check: `npm run typecheck`

## How it works

| Piece | What it does |
|---|---|
| `server/index.mjs` | Plain Node HTTP API. Handles validation, ownership checks and live sync over Server-Sent Events |
| `server/store.mjs` | JSON-file database (`data/db.json`). Writes are serialized and atomic (temp file + rename) |
| `server/places.mjs` | Restaurant discovery and geocoding behind one provider-independent shape |
| `shared/foods.js` | Food categories, cuisine matching and dish-name suggestions |
| `src/` | React + TypeScript + Tailwind UI |

**Live sync.** Every change is saved to `data/db.json`. The server then pushes the group's new state to every open device. If a connection drops it reconnects on its own, and the header shows **Live** or **Reconnecting**.

**Who can change what.** Joining gives a device a random secret token. Only its SHA-256 hash is stored on the server. Every write works out *who you are* from the token, never from the request body. So you can only change your own name, order and the dishes you added. Names must be unique within a group, and you can't delete a dish someone else has ordered.

**Refresh-safe.** All data is stored on the server. The browser keeps only its own token, so reloading or reopening the link restores everything.

## Restaurant data, honestly

- **Zomato** shut down its public API, so it isn't used, and nothing is scraped.
- **Default: OpenStreetMap** (no key needed). It searches Overpass and Photon within 12 km and sorts by distance. OSM has no ratings, prices or photos, so the app shows "No rating data" and "Price not listed" instead of inventing them.
- **Optional: Google Places (New).** Set `GOOGLE_PLACES_API_KEY` in the server's environment to get ratings, price ranges (labelled *Est.*) and photos. The key stays on the server, and photos are proxied through `/api/places/photo`. Note that Google's terms limit how long Places content may be cached.
- **Menus.** No licensed menu API covers these restaurants, so the group builds each menu. Every price is marked **Est.** and shows who entered it. The data model has a `priceSource` field (`participant_estimate` / `provider_verified`) for when a verified source becomes available.
- **Location.** The browser asks for permission first. Browsers only share location on `https://` or `localhost`, so phones opening a LAN `http://` link use the manual search, which uses OSM Nominatim.

## Reset data

Stop the server and delete `data/db.json`.
