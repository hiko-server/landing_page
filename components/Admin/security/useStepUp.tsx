import { useCallback, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { markStepUpCancelled, parseStepUpChallenge, type StepUpChallenge } from './stepUpClient'

// The dialog (and the passkey library behind it) loads only when a step-up is needed.
const StepUpDialog = dynamic(() => import('./StepUpDialog'), { ssr: false })

type Pending = { reason: string; challenge: StepUpChallenge; resolve: (ok: boolean) => void }

/**
 * `fetch` for dangerous admin actions. When the server answers 403
 * STEP_UP_REQUIRED, the "Confirm it's you" dialog opens; after a successful
 * verification the request is sent once more and that response returned.
 * When the owner closes the dialog the original 403 comes back, marked so
 * `wasStepUpCancelled(res)` is true (show nothing then).
 *
 *   const { fetchWithStepUp, stepUpElement } = useStepUp()
 *   const res = await fetchWithStepUp(url, init, 'Restoring replaces the live site.')
 *   …
 *   return <>{…}{stepUpElement}</>
 */
export function useStepUp(): {
  fetchWithStepUp: (input: string, init?: RequestInit, reason?: string) => Promise<Response>
  stepUpElement: ReactNode
} {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)

  const ask = useCallback(
    (reason: string, challenge: StepUpChallenge) =>
      new Promise<boolean>((resolve) => {
        const p: Pending = {
          reason,
          challenge,
          resolve: (ok) => {
            pendingRef.current = null
            setPending(null)
            resolve(ok)
          },
        }
        pendingRef.current = p
        setPending(p)
      }),
    [],
  )

  const fetchWithStepUp = useCallback(
    async (input: string, init?: RequestInit, reason = 'This action changes the live site.') => {
      const res = await fetch(input, init)
      if (res.status !== 403) return res
      let body: unknown = null
      try {
        body = await res.clone().json()
      } catch {
        return res
      }
      const challenge = parseStepUpChallenge(res.status, body)
      if (!challenge) return res
      const ok = await ask(reason, challenge)
      if (!ok) return markStepUpCancelled(res)
      return fetch(input, init)
    },
    [ask],
  )

  const stepUpElement = pending ? (
    <StepUpDialog
      reason={pending.reason}
      challenge={pending.challenge}
      onDone={(ok) => pendingRef.current?.resolve(ok)}
    />
  ) : null

  return { fetchWithStepUp, stepUpElement }
}
