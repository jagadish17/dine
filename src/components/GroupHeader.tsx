import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Share2, X } from 'lucide-react';
import type { Snapshot } from '../lib/types';
import type { SyncStatus } from '../hooks/useGroup';
import { api } from '../lib/api';
import { Avatar, Logo, useToast } from './ui';

export function LiveIndicator({ status }: { status: SyncStatus }) {
  const live = status === 'live';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${live ? 'bg-[#E6F0E9] text-leaf' : 'bg-ember-tint text-ember-dark'}`} title={live ? 'Changes sync instantly' : 'Reconnecting to live updates…'}>
      <span className="relative flex h-2 w-2">
        {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-leaf opacity-50" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? 'bg-leaf' : 'bg-ember'}`} />
      </span>
      {live ? 'Live' : status === 'connecting' ? 'Connecting' : 'Reconnecting'}
    </span>
  );
}

export default function GroupHeader({ snap, status }: { snap: Snapshot; status: SyncStatus }) {
  const [open, setOpen] = useState(false);
  const online = new Set(snap.online);
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-8">
        <Link to="/" aria-label="DineTogether home" className="shrink-0"><span className="hidden sm:inline"><Logo /></span><span className="sm:hidden"><LogoMark /></span></Link>
        <div className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[17px] font-medium leading-tight">{snap.group.name}</p>
          <p className="truncate text-xs text-ink-faint">{snap.participants.length} {snap.participants.length === 1 ? 'person' : 'people'}<span className="hidden min-[400px]:inline"> · {online.size} online</span></p>
        </div>
        <div className="hidden -space-x-2 md:flex">
          {snap.participants.slice(0, 5).map((p) => <Avatar key={p.id} id={p.id} name={p.name} online={online.has(p.id)} size={30} />)}
          {snap.participants.length > 5 && <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-cream-deep text-xs ring-2 ring-white">+{snap.participants.length - 5}</span>}
        </div>
        <LiveIndicator status={status} />
        <button className="btn-dark px-3.5 py-2 text-sm sm:px-4" aria-label="Invite friends" onClick={() => setOpen(true)}><Share2 className="h-4 w-4" /><span className="hidden sm:inline">Invite</span></button>
      </div>
      {open && <ShareDialog code={snap.group.inviteCode} name={snap.group.name} onClose={() => setOpen(false)} />}
    </header>
  );
}

function LogoMark() {
  return <span className="grid h-8 w-8 place-items-center rounded-xl bg-ember text-cream"><svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="16" cy="17.5" r="8" /><path d="M8 7.5h16" /></svg></span>;
}

export function ShareDialog({ code, name, onClose }: { code: string; name: string; onClose: () => void }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [lanHosts, setLanHosts] = useState<string[]>([]);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

  useEffect(() => { api.config().then((c) => { setLanHosts(c.lanHosts); setPublicUrl(c.publicUrl); }).catch(() => {}); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Public tunnel link (npm run share:online) works from any network; otherwise, when on
  // localhost, use this computer's Wi-Fi address so phones on the same network can open it.
  const origin = publicUrl ? publicUrl.replace(/\/$/, '') : isLocal && lanHosts[0] ? `${location.protocol}//${lanHosts[0]}${location.port ? ':' + location.port : ''}` : location.origin;
  const link = `${origin}/g/${code}`;

  async function copy() {
    try { await navigator.clipboard.writeText(link); } catch {
      const t = document.createElement('textarea'); t.value = link; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setCopied(true); toast('Invite link copied');
    setTimeout(() => setCopied(false), 2000);
  }
  async function share() {
    try { await navigator.share({ title: name, text: `Join “${name}” on DineTogether and pick your dinner`, url: link }); } catch { /* user cancelled */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="share-title" className="fade-in w-full max-w-md rounded-t-3xl bg-white p-6 shadow-lift sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 id="share-title" className="text-2xl font-medium">Invite friends</h2>
            <p className="mt-1 text-sm text-ink-soft">Anyone with this link can join “{name}” from their own phone.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-ink-faint hover:bg-cream" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-line bg-cream p-2 pl-4">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{link}</span>
          <button className="btn-primary px-4 py-2 text-sm" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <p className="mt-3 text-xs text-ink-faint">Invite code <span className="font-mono font-medium text-ink-soft">{code}</span></p>
        {publicUrl ? (
          <p className="mt-3 rounded-xl bg-[#E6F0E9] px-3 py-2 text-xs text-leaf">Public link: works on any Wi-Fi or mobile data while sharing is running on the host computer.</p>
        ) : isLocal && (
          <p className="mt-3 rounded-xl bg-ember-tint px-3 py-2 text-xs text-[#7A3410]">
            {lanHosts.length ? 'Using this computer’s Wi-Fi address so phones on the same network can open it.' : 'You’re on localhost — phones can’t open localhost links. Open the app using this computer’s network IP instead.'}
          </p>
        )}
        {typeof navigator.share === 'function' && <button className="btn-ghost mt-4 w-full" onClick={share}><Share2 className="h-4 w-4" /> Share via…</button>}
      </div>
    </div>
  );
}
