'use client';

import { useActionState } from 'react';
import { Field, FormMessage } from '@/components/Field';
import { COUNTRIES } from '@/lib/validation';
import type { ActionResult } from '@/lib/server/errors';
import { updateProfile } from './actions';

type Initial = Record<'display_name' | 'headline' | 'bio' | 'skills' | 'city' | 'country_code' | 'whatsapp', string>;

export function ProfileForm({ initial }: { initial: Initial }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(updateProfile, { ok: false, error: '' });
  const f = !state.ok ? state.fields ?? {} : {};

  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage ok={state.ok} error={!state.ok ? state.error : undefined} success="Profil enregistré." />

      <Field id="display_name" label="Nom affiché" error={f.display_name}>
        <input id="display_name" name="display_name" defaultValue={initial.display_name} required minLength={2} maxLength={60} className="field" />
      </Field>
      <Field id="headline" label="Titre" hint="Ex. : Électricien bâtiment, 8 ans d’expérience" error={f.headline}>
        <input id="headline" name="headline" defaultValue={initial.headline} maxLength={120} className="field" />
      </Field>
      <Field id="bio" label="Présentation" error={f.bio}>
        <textarea id="bio" name="bio" defaultValue={initial.bio} maxLength={1500} rows={5} className="field" />
      </Field>
      <Field id="skills" label="Compétences" hint="Séparées par des virgules, 15 maximum" error={f.skills}>
        <input id="skills" name="skills" defaultValue={initial.skills} maxLength={700} className="field" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="country_code" label="Pays" error={f.country_code}>
          <select id="country_code" name="country_code" defaultValue={initial.country_code} className="field">
            {Object.entries(COUNTRIES).map(([code, c]) => (
              <option key={code} value={code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="city" label="Ville" error={f.city}>
          <input id="city" name="city" defaultValue={initial.city} maxLength={60} className="field" />
        </Field>
      </div>

      <Field id="whatsapp" label="WhatsApp (privé)" hint="Jamais affiché publiquement. Ex. : 77 123 45 67" error={f.whatsapp}>
        <input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" defaultValue={initial.whatsapp} maxLength={20} className="field" />
      </Field>

      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}
