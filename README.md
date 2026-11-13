# DineTogether

Plan a group dinner together. Start a dinner, share the link, and everyone picks food from what's available at restaurants within 12 km. A live panel shows who chose what, the totals and the counts.

**Live site:** https://jagadish17.github.io/dine/

## Using it

1. **Start a dinner** on the homepage (name + area). You get a **6-letter code**, e.g. `K7M2QX`.
2. **Share the code or the dinner link**, using the **Share link** button. ⚠️ Don't send the plain homepage: opening it and pressing *Start dinner* creates a new, separate dinner.
3. Friends open the link, **or** type the code in **"Join a friend's dinner"** on the homepage.
4. Everyone enters their name, picks food and taps **Submit**. The right-hand panel shows everyone's choices and totals.
5. The homepage lists **"Your dinners"**, so you can get back to a dinner later.

## How it works (no server)

The whole app is a static website hosted free on **GitHub Pages**.

| Part | How |
|---|---|
| Foods within 12 km | All foods show **instantly**. In the background, the first phone checks real restaurants within 12 km using free OpenStreetMap services (Overpass, Photon, Nominatim), then narrows the list and **saves it with the dinner**, so everyone else gets it instantly. |
| Saving choices | Each person's choice is **saved online** as a signed, encrypted record on several free public Nostr relays (see `src/lib/sync.ts`). Anyone opening the link, **at any time**, loads everyone's latest choices, and new changes arrive live. |
| Privacy | Records are **AES-GCM encrypted with a key derived from the dinner code**, which is only in the link. Relays see neither the code nor the content. Each phone signs its own record, so nobody can overwrite another person's choice. |
| Offline | Every phone also keeps a copy (localStorage), so the page opens instantly. Changes made offline are sent automatically once back online. The header shows *Saved online / Saving… / Offline · will retry*. |
| Codes & links | Short 6-letter code. The dinner name/area are saved online too, so the code alone is enough. The link (`…/#/g/<code>?…`) also carries them as a backup. |

**Notes**
- Public relays are free community servers. Saved dinners usually stay available for a long time, but there's no guarantee of keeping them forever. That's fine for planning a dinner.
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
