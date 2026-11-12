// Only this device's identity is kept in localStorage (which participant you are in a group).
// All group data — participants, menus, orders — lives on the server and is shared live.
export interface Session { participantId: string; token: string; groupName?: string; joinedAt: string }

const KEY = (code: string) => `dinetogether:session:${code}`;

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export function getSession(code: string): Session | null {
  return safe(() => JSON.parse(localStorage.getItem(KEY(code)) || 'null'), null);
}

export function saveSession(code: string, s: Omit<Session, 'joinedAt'>) {
  safe(() => localStorage.setItem(KEY(code), JSON.stringify({ ...s, joinedAt: new Date().toISOString() })), undefined);
}

export function clearSession(code: string) {
  safe(() => localStorage.removeItem(KEY(code)), undefined);
}

export function recentGroups(): { code: string; name: string; joinedAt: string }[] {
  return safe(() => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (!k.startsWith('dinetogether:session:')) continue;
      const s = JSON.parse(localStorage.getItem(k)!) as Session;
      out.push({ code: k.slice('dinetogether:session:'.length), name: s.groupName || 'Dinner group', joinedAt: s.joinedAt });
    }
    return out.sort((a, b) => b.joinedAt.localeCompare(a.joinedAt)).slice(0, 5);
  }, []);
}
