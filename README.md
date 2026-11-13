# DineTogether

Plan a group dinner together. Start a dinner, share the link, and everyone picks food from what's available at restaurants within 12 km. A live panel shows who chose what, the totals and the counts.

**Live site:** https://jagadish17.github.io/dine/

## How it works (no server)

The whole app is a static website hosted free on **GitHub Pages**.

| Part | How |
|---|---|
| Foods within 12 km | Each phone asks free OpenStreetMap services (Overpass, Photon, Nominatim) for real restaurants within 12 km. The first phone to finish shares the list with everyone, and it's kept on the phone for 24 hours. If the services are busy, all foods are shown with a note, and the app retries by itself. |
| Sharing choices | Phones in the same dinner find each other through free public Nostr relays, then connect directly (WebRTC, via [Trystero](https://github.com/dmotz/trystero)). Messages are **encrypted with the dinner code**, which only people with the link know. |
| Saving | Every phone keeps a full copy of the dinner (localStorage), so refreshing loses nothing. When phones reconnect, the newest version of each person's choice wins. |
| The link | `…/#/g/<code>?n=<name>&a=<area>&lat=…&lng=…` carries the dinner's name and area, so anyone can open it at any time. |

**Limits**
- Choices sync **while people have the page open**. If you choose while nobody else is online, they'll see your choice the next time you're both on the page together.
- Some strict office networks block the direct phone-to-phone connection. Mobile data and home Wi-Fi work.
- Prices are approximate typical prices (edit them in `shared/foods.js`). Zomato has no public API, so its data isn't used.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # cost and merge logic
```

## Publish updates

```bash
npm run deploy
```

This builds the site and pushes it to the `gh-pages` branch, which GitHub Pages serves at https://jagadish17.github.io/dine/. Commit and push your code to `main` as usual.
