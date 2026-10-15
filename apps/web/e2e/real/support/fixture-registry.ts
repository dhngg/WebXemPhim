import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../');

export interface FixtureRecord {
  kind: string;
  id: string;
  state: string;
}

/** One browser-submitted request. Only the method, a path template, the status and body key names are kept. */
export interface RequestEvidence {
  step: string;
  method: string;
  path: string;
  status: number;
  bodyKeys: string[];
}

interface CleanupAction {
  label: string;
  run: () => Promise<void>;
}

export class FixtureRegistry {
  readonly runId = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomBytes(4).toString('hex')}`;
  private readonly records: FixtureRecord[] = [];
  private readonly cleanupActions: CleanupAction[] = [];
  private readonly requests: RequestEvidence[] = [];

  record(kind: string, id: string, state = 'created'): void {
    this.records.push({ kind, id, state });
  }

  update(kind: string, id: string, state: string): void {
    const record = this.records.find((item) => item.kind === kind && item.id === id);
    if (record) record.state = state;
  }

  evidence(entry: RequestEvidence): void {
    this.requests.push(entry);
  }

  defer(label: string, run: () => Promise<void>): void {
    this.cleanupActions.push({ label, run });
  }

  async cleanup(): Promise<string[]> {
    const failures: string[] = [];
    for (const action of [...this.cleanupActions].reverse()) {
      try {
        await action.run();
      } catch {
        failures.push(action.label);
      }
    }
    return failures;
  }

  async writeManifest(cleanupFailures: readonly string[]): Promise<void> {
    const directory = resolve(webRoot, '.real-smoke/manifests');
    await mkdir(directory, { recursive: true });
    await writeFile(
      resolve(directory, `${this.runId}-manifest.json`),
      `${JSON.stringify(
        {
          runId: this.runId,
          records: this.records,
          requests: this.requests,
          cleanupFailures,
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
  }
}

export function fixtureEmail(runId: string, persona: string): string {
  return `fe11-${runId}-${persona}@example.com`;
}

export function fixturePassword(): string {
  return `Fe11-${randomBytes(12).toString('base64url')}!`;
}

export function stableIdempotencyKey(runId: string, operation: string): string {
  return `fe11-${runId}-${operation}`;
}
