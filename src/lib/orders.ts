export const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: 'En attente du vendeur', cls: 'bg-saffron-soft' },
  accepted: { label: 'Acceptée — à payer', cls: 'bg-ok/10 text-ok' },
  refused: { label: 'Refusée', cls: 'bg-danger/10 text-danger' },
  paid_declared: { label: 'Paiement déclaré', cls: 'bg-ok/10 text-ok' },
  paid_confirmed: { label: 'Payée ✔', cls: 'bg-ok text-white' },
  cancelled: { label: 'Annulée', cls: 'bg-line' },
};

export const fcfa = (n: number) => `${Number(n).toLocaleString('fr-SN')} FCFA`;
