'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

type Step = { kind: 'loading' } | { kind: 'enroll'; factorId: string; qr: string; secret: string } | { kind: 'verify'; factorId: string } | { kind: 'error'; message: string };

export function MfaForm({ next }: { next: string }) {
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setStep({ kind: 'error', message: 'Impossible de charger la vérification.' });
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) return setStep({ kind: 'verify', factorId: verified.id });
      const enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Sama Talent admin' });
      if (enrolled.error) return setStep({ kind: 'error', message: 'Impossible de créer le code.' });
      setStep({ kind: 'enroll', factorId: enrolled.data.id, qr: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret });
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== 'enroll' && step.kind !== 'verify') return;
    if (!/^\d{6}$/.test(code)) return setMsg('Le code fait 6 chiffres.');
    setBusy(true);
    setMsg(null);
    const { error } = await supabaseBrowser().auth.mfa.challengeAndVerify({ factorId: step.factorId, code });
    setBusy(false);
    if (error) return setMsg('Code incorrect ou expiré.');
    window.location.assign(next);
  }

  if (step.kind === 'loading') return <p className="mt-6 text-ink-soft">Chargement…</p>;
  if (step.kind === 'error') return <p className="err mt-6">{step.message}</p>;

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {step.kind === 'enroll' && (
        <div className="card p-4 text-sm">
          <p className="font-medium">1. Scannez ce code avec votre application</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={step.qr} alt="QR code de vérification" className="mx-auto my-3 h-44 w-44 bg-white p-2" />
          <p className="hint break-all">Ou saisissez la clé : {step.secret}</p>
          <p className="mt-3 font-medium">2. Entrez le code affiché</p>
        </div>
      )}
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        className="field text-center text-2xl tracking-[0.5em]"
        placeholder="••••••"
        aria-label="Code à 6 chiffres"
      />
      {msg && <p className="err">{msg}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? 'Vérification…' : 'Valider'}
      </button>
    </form>
  );
}
