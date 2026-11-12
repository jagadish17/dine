import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../lib/types';
import { ApiError } from '../lib/api';

export type SyncStatus = 'connecting' | 'live' | 'reconnecting';

const POLL_MS = 3000;

/** Keeps a group's snapshot in sync for everyone.
 *  1. Server-Sent Events: the server pushes the full (small) group state after every change.
 *  2. Fallback polling: some tunnels/proxies (e.g. Cloudflare quick tunnels) hold back event
 *     streams, so while no pushed update has arrived we fetch the snapshot every 3 seconds. */
export function useGroup(code: string | null, participantId: string | null) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<SyncStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const streamOk = useRef(false);
  const fetchRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!code) { setSnap(null); return; }
    let cancelled = false;
    streamOk.current = false;
    setStatus('connecting');
    const url = `/api/groups/${encodeURIComponent(code)}`;

    const fetchSnap = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) { setError(data.error || 'This dinner group does not exist.'); es.close(); }
          throw new ApiError(res.status, data.error);
        }
        setSnap(data); setStatus('live'); setError(null);
      } catch {
        if (!cancelled && !streamOk.current) setStatus('reconnecting');
      }
    };
    fetchRef.current = fetchSnap;

    const es = new EventSource(`${url}/events${participantId ? `?pid=${participantId}` : ''}`);
    es.addEventListener('snapshot', (e) => {
      if (cancelled) return;
      streamOk.current = true;
      setSnap(JSON.parse((e as MessageEvent).data));
      setStatus('live'); setError(null);
    });
    es.onerror = () => { if (!cancelled) { streamOk.current = false; fetchSnap(); } };

    fetchSnap();
    const timer = setInterval(() => { if (!streamOk.current) fetchSnap(); }, POLL_MS);
    return () => { cancelled = true; es.close(); clearInterval(timer); };
  }, [code, participantId]);

  /** Fetch the latest snapshot now (e.g. right after submitting). */
  const refresh = useCallback(() => fetchRef.current(), []);
  /** Apply a local change immediately; the next server snapshot replaces it. */
  const optimistic = useCallback((fn: (s: Snapshot) => Snapshot) => setSnap((s) => (s ? fn(s) : s)), []);

  return { snap, status, error, refresh, optimistic };
}
