/**
 * The GitHub alert syntax shared by the compiler (./alerts.ts turns a
 * marked blockquote into a callout) and the admin's visual editor (which
 * reads and writes the same marker): `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
 * `[!WARNING]`, `[!CAUTION]`, any case, at the start of the quote's first
 * paragraph. Dependency-free, so the editor bundle does not pull in the
 * compiler's language dictionaries.
 */

export const CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const
export type CalloutType = (typeof CALLOUT_TYPES)[number]

export const CALLOUT_MARKER_RE = /^\s*\[!(note|tip|important|warning|caution)\]/i

export const isCalloutType = (value: unknown): value is CalloutType => typeof value === 'string' && (CALLOUT_TYPES as readonly string[]).includes(value)

/** The marker a callout of this type is written with (`[!NOTE]`). */
export const calloutMarker = (type: CalloutType): string => `[!${type.toUpperCase()}]`
