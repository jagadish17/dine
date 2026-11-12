import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, UtensilsCrossed } from 'lucide-react';

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`grid place-items-center rounded-xl bg-ember text-cream ${size === 'lg' ? 'h-10 w-10' : 'h-8 w-8'}`}>
        <svg viewBox="0 0 32 32" className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <circle cx="16" cy="17.5" r="8" /><path d="M8 7.5h16" />
        </svg>
      </span>
      <span className={`font-display font-semibold tracking-tight ${size === 'lg' ? 'text-2xl' : 'hidden text-[19px] min-[380px]:inline'}`}>DineTogether</span>
    </span>
  );
}

const AVATAR_TONES = ['bg-[#F3DCCB] text-[#8A3A12]', 'bg-[#E3E8D5] text-[#3F5524]', 'bg-[#E9DDF0] text-[#5B3772]', 'bg-[#D9E6EE] text-[#2B5168]', 'bg-[#F2E3B9] text-[#76561A]', 'bg-[#EED5D5] text-[#7A2E2E]'];
export function Avatar({ name, id, online, size = 32 }: { name: string; id: string; online?: boolean; size?: number }) {
  const tone = AVATAR_TONES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }} title={name}>
      <span className={`grid h-full w-full place-items-center rounded-full font-semibold ring-2 ring-white ${tone}`} style={{ fontSize: size * 0.38 }}>{initials}</span>
      {online && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-leaf ring-2 ring-white" title="Online now" />}
    </span>
  );
}

const TONES: Record<string, string> = {
  tomato: 'from-[#F4D2C2] to-[#E7A788]', amber: 'from-[#F6E2B8] to-[#E8BD6A]', saffron: 'from-[#F7DDB0] to-[#E2A048]',
  olive: 'from-[#E4E3C4] to-[#BFC08A]', wheat: 'from-[#F3E6CC] to-[#DDC291]', clay: 'from-[#EFD8C9] to-[#CF9F83]',
  ember: 'from-[#F2CDB6] to-[#D9814F]', leaf: 'from-[#DCE7D2] to-[#A6C190]', stone: 'from-[#EEE7DD] to-[#D6C9B6]',
};
export function toneFor(text: string) {
  const keys = Object.keys(TONES);
  return keys[[...text].reduce((a, c) => a + c.charCodeAt(0), 0) % keys.length];
}

/** Shows a real image when one exists; otherwise a typographic tile — never a fake photo. */
export function FoodTile({ src, label, tone, className = '' }: { src?: string | null; label: string; tone?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return <img src={src} alt={label} loading="lazy" onError={() => setBroken(true)} className={`object-cover bg-cream-deep ${className}`} />;
  }
  return (
    <div className={`relative grid place-items-center overflow-hidden bg-gradient-to-br ${TONES[tone || toneFor(label)] || TONES.stone} ${className}`} aria-hidden>
      <span className="font-display text-[2.4em] font-medium text-white/90 drop-shadow-sm">{label.trim()[0]?.toUpperCase()}</span>
      <UtensilsCrossed className="absolute bottom-2 right-2 h-3.5 w-3.5 text-white/60" />
    </div>
  );
}

export function SectionHeader({ step, title, subtitle, action }: { step?: number; title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {step && <p className="eyebrow mb-1.5">Step {step}</p>}
        <h2 className="text-[26px] font-medium leading-tight sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1.5 text-[15px] text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[#EBC9B6] bg-ember-tint px-4 py-3 text-sm text-[#7A3410]">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{children}</div>
      {onRetry && <button className="font-medium underline underline-offset-2" onClick={onRetry}>Try again</button>}
    </div>
  );
}

// ---------- toasts ----------
type Toast = { id: number; text: string; kind: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 5000 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`fade-in pointer-events-auto flex max-w-md items-center gap-2 rounded-full px-4 py-2.5 text-sm shadow-lift ${t.kind === 'error' ? 'bg-[#7A3410] text-white' : 'bg-ink text-cream'}`}>
            {t.kind === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-[#9FD3B4]" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
