/**
 * One process-wide queue for image encoding (SERVER-ONLY, no sharp import).
 *
 * An upload is decoded and re-encoded into a dozen files (WebP and AVIF at
 * every width, the blur placeholder — lib/imageVariants), and an AVIF
 * encoder's working memory is several times the image's. Run side by side —
 * two editor tabs, an image import, the media-optimize backfill — four large
 * photos took the 1 GiB container past its memory limit and it was killed
 * (OPS-2). So every sharp job that makes variants goes through this queue:
 * at most IMAGE_JOB_CONCURRENCY at a time (default 1 — the server has one
 * vCPU, so a second encoder would only share it), the rest wait in arrival
 * order. A bounded number may wait (IMAGE_JOB_QUEUE_MAX, default 8); beyond
 * that a job is refused at once (ImageQueueFullError → HTTP 503 with
 * Retry-After) instead of holding yet another request body in memory.
 *
 * The queue lives on globalThis: Next.js bundles each API route on its own,
 * and a module-level queue would be one per route — no limit at all.
 */

export class ImageQueueFullError extends Error {
  readonly status = 503
  readonly retryAfterSeconds: number
  constructor(retryAfterSeconds = 10) {
    super('The server is busy processing other images. Try again in a few seconds.')
    this.name = 'ImageQueueFullError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export type JobQueueStats = { running: number; waiting: number; concurrency: number; maxWaiting: number }

/** A FIFO limiter: `run(job)` starts the job when a slot is free (at once if one is). */
export class JobQueue {
  readonly concurrency: number
  readonly maxWaiting: number
  private running = 0
  private readonly waiting: Array<() => void> = []

  constructor(concurrency = 1, maxWaiting = 8) {
    this.concurrency = Math.max(1, Math.floor(concurrency) || 1)
    this.maxWaiting = Math.max(0, Math.floor(maxWaiting) || 0)
  }

  stats(): JobQueueStats {
    return { running: this.running, waiting: this.waiting.length, concurrency: this.concurrency, maxWaiting: this.maxWaiting }
  }

  /**
   * Run `job` when a slot is free. `background` jobs (the media-optimize
   * backfill, one image at a time) always wait for their turn; a request's
   * job is refused once `maxWaiting` others wait.
   */
  async run<T>(job: () => Promise<T>, opts: { background?: boolean } = {}): Promise<T> {
    if (this.running >= this.concurrency) {
      if (!opts.background && this.waiting.length >= this.maxWaiting) throw new ImageQueueFullError()
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    } else {
      this.running++
    }
    try {
      return await job()
    } finally {
      const next = this.waiting.shift()
      // The slot passes straight to the next job; `running` only drops when nobody waits.
      if (next) next()
      else this.running--
    }
  }
}

/** A positive integer from the environment, else `fallback`, clamped to [min, max]. */
export function envInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(value ?? ''), 10)
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : fallback))
}

const KEY = Symbol.for('landing.imageJobs')

/** The process-wide image queue (see the module comment). */
export function imageJobs(): JobQueue {
  const g = globalThis as typeof globalThis & { [KEY]?: JobQueue }
  if (!g[KEY]) g[KEY] = new JobQueue(envInt(process.env.IMAGE_JOB_CONCURRENCY, 1, 1, 4), envInt(process.env.IMAGE_JOB_QUEUE_MAX, 8, 0, 64))
  return g[KEY] as JobQueue
}
