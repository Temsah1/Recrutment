import readline from 'node:readline/promises';
import { ConfigError, loadConfig, type AppConfig } from '../config.js';
import { closeDatabase, openDatabase, runMigrations, type Db } from '../db/connection.js';
import { seedDefaults } from '../db/seed.js';

export type CliArgs = Record<string, string | true>;

export function parseArgs(argv = process.argv.slice(2)): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

export function loadCliConfig(): AppConfig {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) fail(error.message);
    throw error;
  }
}

export function initCli(options: { migrate?: boolean } = {}): { config: AppConfig; db: Db } {
  const config = loadCliConfig();
  const db = openDatabase(config.databasePath);
  try {
    if (options.migrate !== false) {
      const applied = runMigrations(db, config.migrationsDir);
      if (applied.length > 0) {
        console.log(`Applied migrations: ${applied.map((m) => m.version).join(', ')}`);
      }
      seedDefaults(db);
    }
  } catch (error) {
    closeDatabase(db);
    fail((error as Error).message);
  }
  return { config, db };
}

export async function promptText(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Reads a secret without echoing it. Requires an interactive terminal. */
export async function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) fail('No interactive terminal available. Provide the password via environment variable.');
  process.stdout.write(question);
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw ?? false;
  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise((resolve) => {
    let value = '';
    const cleanup = () => {
      stdin.setRawMode?.(wasRaw);
      stdin.pause();
      stdin.off('data', onData);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };
    stdin.on('data', onData);
  });
}
