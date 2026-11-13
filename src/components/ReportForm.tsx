'use client';

import { useActionState } from 'react';
import { REPORT_REASONS } from '@/lib/validation';
import type { ActionResult } from '@/lib/server/errors';
import { createReport } from '@/app/signalement/actions';

export function ReportForm({ targetType, targetId, label }: { targetType: 'listing' | 'profile'; targetId: string; label: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createReport, { ok: false, error: '' });

  if (state.ok) {
    return (
      <p role="status" className="mt-6 rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok">
        Merci. Notre équipe va examiner ce signalement. Il reste anonyme.
      </p>
    );
  }

  return (
    <details className="mt-6 text-sm">
      <summary className="cursor-pointer text-ink-soft underline-offset-4 hover:underline">⚑ {label}</summary>
      <form action={action} className="card mt-3 space-y-3 p-4">
        <input type="hidden" name="target_type" value={targetType} />
        <input type="hidden" name="target_id" value={targetId} />
        <fieldset className="space-y-2">
          <legend className="label">Motif</legend>
          {Object.entries(REPORT_REASONS).map(([k, v]) => (
            <label key={k} className="flex items-start gap-2">
              <input type="radio" name="reason" value={k} required className="mt-1" /> {v}
            </label>
          ))}
        </fieldset>
        <textarea name="details" maxLength={1000} rows={3} placeholder="Précisions (facultatif)" className="field" />
        {!state.ok && state.error && <p className="err">{state.error}</p>}
        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? 'Envoi…' : 'Envoyer le signalement'}
        </button>
      </form>
    </details>
  );
}
