import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { AppError } from '../lib/errors.js';

/**
 * Private filesystem storage. Paths stored in the database are always relative
 * to the private root; no absolute path is ever exposed through the API.
 */
export class FileStorage {
  readonly root: string;
  private readonly tmpDir: string;
  private ready = false;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.tmpDir = path.join(this.root, '.tmp');
  }

  init(): void {
    fs.mkdirSync(this.root, { recursive: true, mode: 0o750 });
    fs.mkdirSync(this.tmpDir, { recursive: true, mode: 0o750 });
    const probe = path.join(this.tmpDir, `.probe-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probe, 'ok', { mode: 0o600 });
    fs.unlinkSync(probe);
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  checkWritable(): boolean {
    try {
      const probe = path.join(this.tmpDir, `.probe-${process.pid}-${Date.now()}`);
      fs.writeFileSync(probe, 'ok', { mode: 0o600 });
      fs.unlinkSync(probe);
      return true;
    } catch {
      return false;
    }
  }

  /** Writes a validated buffer and returns the relative storage name. */
  save(buffer: Buffer, extension: string): string {
    if (!/^\.[a-z0-9]{2,5}$/.test(extension)) {
      throw new AppError(500, 'internal_error', 'Invalid storage extension');
    }
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const rel = `${year}/${month}/${crypto.randomUUID()}${extension}`;
    const absolute = this.absolutePath(rel);
    const tmp = path.join(this.tmpDir, `${crypto.randomUUID()}.part`);
    fs.mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o750 });
    try {
      fs.writeFileSync(tmp, buffer, { mode: 0o600 });
      fs.renameSync(tmp, absolute);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
    return rel;
  }

  absolutePath(relative: string): string {
    if (!relative || path.isAbsolute(relative) || relative.includes('\0')) {
      throw new AppError(400, 'bad_request', 'Invalid storage reference');
    }
    const normalized = relative.replace(/\\/g, '/');
    if (normalized.split('/').some((segment) => segment === '..' || segment === '')) {
      throw new AppError(400, 'bad_request', 'Invalid storage reference');
    }
    const resolved = path.resolve(this.root, normalized);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : `${this.root}${path.sep}`;
    if (!resolved.startsWith(rootWithSep)) {
      throw new AppError(400, 'bad_request', 'Invalid storage reference');
    }
    return resolved;
  }

  exists(relative: string): boolean {
    try {
      return fs.statSync(this.absolutePath(relative)).isFile();
    } catch {
      return false;
    }
  }

  size(relative: string): number {
    try {
      return fs.statSync(this.absolutePath(relative)).size;
    } catch {
      return 0;
    }
  }

  createStream(relative: string): ReadStream {
    const absolute = this.absolutePath(relative);
    if (!fs.existsSync(absolute)) {
      throw new AppError(404, 'not_found', 'Document file is missing from storage');
    }
    return createReadStream(absolute);
  }

  delete(relative: string): { deleted: boolean; error?: string } {
    const absolute = this.absolutePath(relative);
    try {
      if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
      return { deleted: true };
    } catch (error) {
      return { deleted: false, error: (error as Error).message };
    }
  }

  /** All stored files as forward-slash relative paths, excluding temp files. */
  listFiles(): string[] {
    const results: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.tmp') continue;
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(absolute);
        } else if (entry.isFile()) {
          results.push(path.relative(this.root, absolute).replace(/\\/g, '/'));
        }
      }
    };
    walk(this.root);
    return results;
  }

  listTemporaryFiles(): { name: string; ageMs: number }[] {
    if (!fs.existsSync(this.tmpDir)) return [];
    const now = Date.now();
    return fs
      .readdirSync(this.tmpDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const absolute = path.join(this.tmpDir, entry.name);
        return { name: absolute, ageMs: now - fs.statSync(absolute).mtimeMs };
      });
  }

  cleanupTemporaryFiles(maxAgeMs = 24 * 60 * 60 * 1000): number {
    let removed = 0;
    for (const file of this.listTemporaryFiles()) {
      if (file.ageMs >= maxAgeMs) {
        try {
          fs.unlinkSync(file.name);
          removed += 1;
        } catch {
          // Left for the next reconciliation run.
        }
      }
    }
    return removed;
  }

  totalBytes(): number {
    let total = 0;
    for (const rel of this.listFiles()) {
      total += this.size(rel);
    }
    return total;
  }
}
