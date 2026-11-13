import type { ReactNode } from 'react';

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="err">
          {error}
        </p>
      ) : hint ? (
        <p className="hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormMessage({ ok, error, success }: { ok?: boolean; error?: string; success: string }) {
  if (ok) return <p role="status" className="rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok">{success}</p>;
  if (error) return <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>;
  return null;
}
