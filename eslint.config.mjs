import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Règle 18 : pas de console.* en dehors du logger qui masque les données perso
      'no-console': 'error',
      // Règle 10 : pas de code évalué dynamiquement
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'react/no-danger': 'error', // pas de dangerouslySetInnerHTML
    },
  },
  { files: ['src/lib/server/log.ts', 'scripts/**'], rules: { 'no-console': 'off' } },
  globalIgnores(['.next/**', 'node_modules/**', 'next-env.d.ts']),
]);
