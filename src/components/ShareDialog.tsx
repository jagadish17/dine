import { useEffect, useState } from 'react';
import { Check, Copy, Share2, X } from 'lucide-react';
import { useToast } from './ui';

export default function ShareDialog({ link, name, code, onClose }: { link: string; name: string; code: string; onClose: () => void }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copy() {
    try { await navigator.clipboard.writeText(link); } catch {
      const t = document.createElement('textarea'); t.value = link; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setCopied(true); toast('Invite link copied');
    setTimeout(() => setCopied(false), 2000);
  }
  async function share() {
    try { await navigator.share({ title: name, text: `Join “${name}” and pick your dinner`, url: link }); } catch { /* cancelled */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="share-title" className="fade-in w-full max-w-md rounded-t-3xl bg-white p-6 shadow-lift sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 id="share-title" className="text-2xl font-medium">Invite friends</h2>
            <p className="mt-1 text-sm text-ink-soft">Anyone with this link can join “{name}” from their own phone, on any network.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-ink-faint hover:bg-cream" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-5 rounded-2xl bg-ink px-5 py-4 text-center text-cream">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-cream/60">Dinner code</p>
          <p className="mt-1 font-mono text-4xl font-semibold tracking-[.25em]">{code}</p>
          <p className="mt-1 text-xs text-cream/60">Friends can type this on the DineTogether homepage</p>
        </div>
        <p className="mt-4 text-sm font-medium">Or send the link</p>
        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-line bg-cream p-2 pl-4">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{link}</span>
          <button className="btn-primary px-4 py-2 text-sm" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <a className="btn bg-[#25D366] px-4 py-2.5 text-sm text-white hover:brightness-95" target="_blank" rel="noreferrer"
            href={`https://wa.me/?text=${encodeURIComponent(`Join “${name}” on DineTogether and pick your dinner: ${link} (code ${code})`)}`}>WhatsApp</a>
          {typeof navigator.share === 'function'
            ? <button className="btn-ghost text-sm" onClick={share}><Share2 className="h-4 w-4" />More…</button>
            : <button className="btn-ghost text-sm" onClick={copy}><Copy className="h-4 w-4" />Copy link</button>}
        </div>
        <p className="mt-4 rounded-xl bg-ember-tint px-3 py-2 text-xs leading-relaxed text-[#7A3410]">Send <b>this</b> link or code. The plain homepage starts a <b>new, separate</b> dinner.</p>
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">Everyone’s choices are saved online (encrypted), so friends see them whenever they open it.</p>
      </div>
    </div>
  );
}
