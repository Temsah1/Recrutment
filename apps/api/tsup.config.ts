import { cpSync } from 'node:fs';
import { defineConfig } from 'tsup';

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
  // Bundle it so the deployment never resolves @esme/shared from node_modules.
  noExternal: ['@esme/shared'],
  // Native / runtime-resolved packages must stay external.
  external: ['better-sqlite3', '@node-rs/argon2', 'file-type'],
  onSuccess: async () => {
    cpSync('../../database/migrations', 'dist/migrations', { recursive: true });
  },
});
