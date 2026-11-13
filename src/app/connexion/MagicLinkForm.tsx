'use client';

import { useActionState } from 'react';
import { sendMagicLink, type LoginState } from './actions';

export function MagicLinkForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: 'idle' });

  if (state.status === 'sent') {
    return (
      <p role="status" className="mt-6 rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-3" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="label">
          Adresse email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          className="field"
          placeholder="vous@exemple.com"
        />
        {state.status === 'error' && <p className="err">{state.message}</p>}
      </div>
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? 'Envoi…' : 'Recevoir mon lien de connexion'}
      </button>
    </form>
  );
}
