'use client';

import { useActionState } from 'react';
import { Field, FormMessage } from '@/components/Field';
import { CATEGORIES, COUNTRIES, LISTING_TYPES } from '@/lib/validation';
import type { ActionResult } from '@/lib/server/errors';

export type ListingInitial = {
  type: string;
  category_slug: string;
  title: string;
  description: string;
  price_xof: string;
  price_negotiable: boolean;
  city: string;
  country_code: string;
};

export function ListingForm({
  action: serverAction,
  initial,
  submitLabel,
  successMessage,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  initial: ListingInitial;
  submitLabel: string;
  successMessage?: string;
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(serverAction, { ok: false, error: '' });
  const f = !state.ok ? state.fields ?? {} : {};

  return (
    <form action={action} className="mt-6 space-y-4">
      <FormMessage ok={state.ok} error={!state.ok ? state.error : undefined} success={successMessage ?? ''} />

      <div className="grid grid-cols-2 gap-3">
        <Field id="type" label="Type" error={f.type}>
          <select id="type" name="type" required className="field" defaultValue={initial.type}>
            <option value="" disabled>
              Choisir…
            </option>
            {Object.entries(LISTING_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field id="category_slug" label="Catégorie" error={f.category_slug}>
          <select id="category_slug" name="category_slug" required className="field" defaultValue={initial.category_slug}>
            <option value="" disabled>
              Choisir…
            </option>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="title" label="Titre" hint="5 à 120 caractères" error={f.title}>
        <input id="title" name="title" required minLength={5} maxLength={120} defaultValue={initial.title} className="field" />
      </Field>
      <Field id="description" label="Description" hint="Missions, conditions, horaires, contact préféré…" error={f.description}>
        <textarea
          id="description"
          name="description"
          required
          minLength={20}
          maxLength={5000}
          rows={7}
          defaultValue={initial.description}
          className="field"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="price_xof" label="Prix / salaire (FCFA)" hint="Facultatif" error={f.price_xof}>
          <input
            id="price_xof"
            name="price_xof"
            inputMode="numeric"
            pattern="[0-9 .]*"
            maxLength={14}
            defaultValue={initial.price_xof}
            className="field"
          />
        </Field>
        <label className="mt-7 flex items-center gap-2 text-sm">
          <input type="checkbox" name="price_negotiable" defaultChecked={initial.price_negotiable} className="h-5 w-5 accent-[#e8a317]" />{' '}
          Négociable
        </label>
      </div>

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
          <input id="city" name="city" required defaultValue={initial.city} minLength={2} maxLength={60} className="field" />
        </Field>
      </div>

      <button className="btn btn-gold w-full" disabled={pending}>
        {pending ? 'Enregistrement…' : submitLabel}
      </button>
    </form>
  );
}
