'use client';

// Règle 17 — jamais de détail technique affiché. Le « digest » est une
// référence opaque que Next associe au vrai message dans les journaux serveur.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Une erreur est survenue</h1>
      <p className="mt-2 text-ink-soft">Réessayez dans un instant.</p>
      {error.digest && <p className="mt-1 text-xs text-ink-soft">Référence : {error.digest}</p>}
      <button onClick={reset} className="btn btn-primary mt-6">
        Réessayer
      </button>
    </div>
  );
}
