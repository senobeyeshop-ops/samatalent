import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <p className="mt-2 text-ink-soft">Cette page n’existe pas ou n’est plus disponible.</p>
      <Link href="/" className="btn btn-primary mt-6">
        Retour à l’accueil
      </Link>
    </div>
  );
}
