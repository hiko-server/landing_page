import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * The admin write a request is performing, visible to code deep in the call
 * stack without passing it through every function: the snapshot writers
 * (lib/contentStore writeSnapshotFile, lib/mdx-admin) note the version files
 * they create, and lib/audit/capture links them to the activity log entry,
 * so the history views can say which change replaced each version.
 *
 * Server-only. The store lives on globalThis so every webpack runtime of the
 * process shares one AsyncLocalStorage.
 */

export type SnapshotKind = 'cv' | 'home' | 'blog' | 'work' | 'page'
export type AuditScope = { snapshots: Array<{ kind: SnapshotKind; file: string }> }

type ScopeGlobal = typeof globalThis & { __auditScope?: AsyncLocalStorage<AuditScope> }

function storage(): AsyncLocalStorage<AuditScope> {
  const g = globalThis as ScopeGlobal
  if (!g.__auditScope) g.__auditScope = new AsyncLocalStorage<AuditScope>()
  return g.__auditScope
}

/** Run `fn` inside a fresh scope; the scope is returned through `scope`. */
export function runInAuditScope<T>(scope: AuditScope, fn: () => T): T {
  return storage().run(scope, fn)
}

/** Record that the current request wrote a version-history file (no-op outside a scope). */
export function noteSnapshot(kind: SnapshotKind, file: string): void {
  try {
    storage().getStore()?.snapshots.push({ kind, file })
  } catch {
    // Bookkeeping only: never fail the snapshot itself.
  }
}
