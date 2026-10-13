import { useCallback, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import {
  cancelledStepUpResponse,
  markStepUpCancelled,
  parseRecentStatus,
  parseStepUpChallenge,
  type StepUpChallenge,
} from './stepUpClient'

// The dialog (and the passkey library behind it) loads only when a step-up is needed.
const StepUpDialog = dynamic(() => import('./StepUpDialog'), { ssr: false })

type Pending = { reason: string; challenge: StepUpChallenge; resolve: (ok: boolean) => void }

/**
 * `fetch` for dangerous admin actions (server rule: lib/adminAuth/stepUp.ts).
 *
 * Before sending, it asks GET /api/admin/security/recent; when this browser
 * has not signed in or verified recently, the "Confirm it's you" dialog opens
 * first, so the action normally never meets a 403. Should the server still
 * answer 403 STEP_UP_REQUIRED (the window ran out in between), the dialog
 * opens and the request is sent once more. When the owner closes the dialog
 * a 403 response comes back marked so `wasStepUpCancelled(res)` is true
 * (show nothing then).
 *
 *   const { fetchWithStepUp, stepUpElement } = useStepUp()
 *   const res = await fetchWithStepUp(url, init, 'Restoring replaces the live site.')
 *   if (wasStepUpCancelled(res)) return
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
    []
  )

  const fetchWithStepUp = useCallback(
    async (input: string, init?: RequestInit, reason = 'This action changes the live site.') => {
      // Ask first (a 200 either way), so the normal path has no failed request.
      try {
        const pre = await fetch('/api/admin/security/recent', {
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (pre.ok) {
          const status = parseRecentStatus(await pre.json())
          if (status && !status.recent && !(await ask(reason, status.challenge)))
            return cancelledStepUpResponse()
        }
      } catch {
        // The action itself still answers 403 when a check is needed.
      }
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
      if (!(await ask(reason, challenge))) return markStepUpCancelled(res)
      return fetch(input, init)
    },
    [ask]
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
