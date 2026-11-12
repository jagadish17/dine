// `npm run share`: serve the built app and API together on one port (8791), reachable on your Wi-Fi.
process.env.DT_SHARE = '1';
await import('../server/index.mjs');
