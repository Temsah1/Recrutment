import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const sharedEntry = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url));

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    serverless: 'src/serverless.ts',
    'cli/bootstrap-admin': 'src/cli/bootstrap-admin.ts',
    'cli/backup': 'src/cli/backup.ts',
    'cli/restore': 'src/cli/restore.ts',
    'cli/verify-storage': 'src/cli/verify-storage.ts',
    'cli/seed-demo': 'src/cli/seed-demo.ts',
    'cli/migrate': 'src/cli/migrate.ts',
  },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  // The workspace package has no published artifact at runtime on Vercel.
  // Bundle its source directly so the build never needs packages/shared/dist.
  noExternal: ['@esme/shared'],
  esbuildOptions(options) {
    options.alias = { ...options.alias, '@esme/shared': sharedEntry };
  },
  // Native / runtime-resolved packages must stay external.
  external: ['better-sqlite3', '@node-rs/argon2', 'file-type'],
  onSuccess: async () => {
    cpSync('../../database/migrations', 'dist/migrations', { recursive: true });
  },
});
