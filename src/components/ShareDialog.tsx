import { useEffect, useState } from 'react';
import { Check, Copy, Share2, X } from 'lucide-react';
import { useToast } from './ui';

export default function ShareDialog({ link, name, onClose }: { link: string; name: string; onClose: () => void }) {
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
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-line bg-cream p-2 pl-4">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{link}</span>
          <button className="btn-primary px-4 py-2 text-sm" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy'}</button>
        </div>
        {typeof navigator.share === 'function' && <button className="btn-ghost mt-4 w-full" onClick={share}><Share2 className="h-4 w-4" /> Share via WhatsApp, SMS…</button>}
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">Choices sync directly between phones while the page is open. Each phone also keeps its own copy, so nothing is lost on refresh.</p>
      </div>
    </div>
  );
}
