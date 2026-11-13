import { notFound } from 'next/navigation';

// Cible des réécritures du proxy (ex. /admin pour un non-admin) : simple 404.
export default function Introuvable() {
  notFound();
}
