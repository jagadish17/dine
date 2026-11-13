import { useCallback, useEffect, useRef, useState } from 'react';
import { joinRoom, type Room } from 'trystero/nostr';
import { merge, newId, type Dinner, type Meta, type Person } from '../lib/dinner';

// Phones in the same dinner find each other through free public Nostr relays, then talk
// directly (WebRTC). Messages are encrypted with the dinner code, which only people with the
// link know. Every phone also keeps a copy in localStorage, so a refresh never loses data.
const APP_ID = 'dinetogether-jagadish17-v1';
// Large, long-running public relays (checked reachable). Every phone uses the same list, so they
// always meet on the same relays; one or two being down doesn't matter.
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://purplerelay.com', 'wss://nostr.data.haus', 'wss://relay.mostro.network'];
const KEY = (code: string) => `dinetogether:dinner:${code}`;
const ME_KEY = (code: string) => `dinetogether:me:${code}`;

const load = (code: string): Dinner | null => { try { return JSON.parse(localStorage.getItem(KEY(code)) || 'null'); } catch { return null; } };
const save = (d: Dinner) => { try { localStorage.setItem(KEY(d.code), JSON.stringify(d)); } catch { /* ignore */ } };

export function myId(code: string) {
  try {
    let id = localStorage.getItem(ME_KEY(code));
    if (!id) { id = newId(); localStorage.setItem(ME_KEY(code), id); }
    return id;
  } catch { return newId(); }
}

export function useDinner(code: string, metaFromLink: Meta | null) {
  const [dinner, setDinner] = useState<Dinner | null>(() => {
    const saved = load(code);
    if (saved) return saved;
    return metaFromLink ? { code, meta: metaFromLink, people: {} } : null;
  });
  const [peers, setPeers] = useState(0);
  const room = useRef<Room | null>(null);
  const sendRef = useRef<(d: Dinner, target?: string) => void>(() => {});
  const latest = useRef(dinner);
  latest.current = dinner;
  const meId = myId(code);

  useEffect(() => { if (dinner) save(dinner); }, [dinner]);

  useEffect(() => {
    const r = joinRoom({ appId: APP_ID, password: `dt-${code}`, relayConfig: { urls: RELAYS, redundancy: RELAYS.length } }, code);
    room.current = r;
    const action = r.makeAction<any>('dinner'); // payload is a Dinner (validated by merge)
    sendRef.current = (d, target) => { action.send(d as any, target ? { target } : undefined); };
    action.onMessage = (data) => {
      setDinner((cur) => {
        if (!cur) return data && (data as Dinner).code === code && (data as Dinner).meta ? merge({ code, meta: (data as Dinner).meta, people: {} }, data as Dinner) : cur;
        return merge(cur, data as Dinner);
      });
    };
    r.onPeerJoin = (peerId) => {
      setPeers(Object.keys(r.getPeers()).length);
      if (latest.current) sendRef.current(latest.current, peerId); // catch the newcomer up
    };
    r.onPeerLeave = () => setPeers(Object.keys(r.getPeers()).length);
    return () => { r.leave(); room.current = null; };
  }, [code]);

  /** Save my own entry and send it to everyone online. */
  const updateMe = useCallback((patch: Omit<Person, 'id' | 'updatedAt'>) => {
    setDinner((cur) => {
      if (!cur) return cur;
      const next = { ...cur, people: { ...cur.people, [meId]: { ...patch, id: meId, updatedAt: Date.now() } } };
      sendRef.current(next);
      return next;
    });
  }, [meId]);

  /** Store the nearby-foods list in the dinner and share it with everyone online. */
  const setFoods = useCallback((foods: NonNullable<Dinner['foods']>) => {
    setDinner((cur) => {
      if (!cur || cur.foods) return cur;
      const next = { ...cur, foods };
      sendRef.current(next);
      return next;
    });
  }, []);

  return { dinner, peers, meId, updateMe, setFoods };
}
