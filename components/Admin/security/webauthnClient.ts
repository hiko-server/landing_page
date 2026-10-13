/**
 * Browser side of passkeys for the admin (server: lib/adminAuth/passkeys.ts).
 * @simplewebauthn/browser (~5 KB gzipped) is imported only when a passkey
 * ceremony actually starts, so no page pays for it up front.
 */

import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser'

const lib = () => import('@simplewebauthn/browser')

/** Does this browser have WebAuthn at all? (Synchronous, no import.) */
export function webAuthnAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function'
}

/** Can the browser offer passkeys in the e-mail field's autofill (conditional mediation)? */
export async function autofillAvailable(): Promise<boolean> {
  if (!webAuthnAvailable()) return false
  try {
    return await (await lib()).browserSupportsWebAuthnAutofill()
  } catch {
    return false
  }
}

export async function getAssertion(
  optionsJSON: PublicKeyCredentialRequestOptionsJSON,
  opts: { autofill?: boolean } = {},
): Promise<AuthenticationResponseJSON> {
  const { startAuthentication } = await lib()
  return startAuthentication({ optionsJSON, useBrowserAutofill: !!opts.autofill })
}

export async function createPasskey(optionsJSON: PublicKeyCredentialCreationOptionsJSON): Promise<RegistrationResponseJSON> {
  const { startRegistration } = await lib()
  return startRegistration({ optionsJSON })
}

/** Stop a pending autofill (conditional) request before starting another ceremony. */
export async function cancelCeremony(): Promise<void> {
  try {
    const { WebAuthnAbortService } = await lib()
    WebAuthnAbortService.cancelCeremony()
  } catch {
    // Nothing pending.
  }
}

/**
 * Tell the browser / password manager that a passkey it offered no longer
 * exists here, so it stops offering it (WebAuthn signals; a no-op where
 * unsupported).
 */
export async function forgetUnknownPasskey(rpID: string, credentialID: string): Promise<void> {
  try {
    await (await lib()).sendSignal({ signalName: 'unknownCredential', rpID, credentialID })
  } catch {
    // Unsupported or refused: harmless.
  }
}

/** Tell the password manager which of this site's passkeys still exist (after a removal). */
export async function syncAcceptedPasskeys(rpID: string, userID: string, ids: string[]): Promise<void> {
  try {
    await (await lib()).sendSignal({ signalName: 'allAcceptedCredentials', rpID, userID, allAcceptedCredentialIDs: ids })
  } catch {
    // Unsupported or refused: harmless.
  }
}

/** Is this the user closing / timing out the passkey prompt (not worth an error message)? */
export function isCeremonyCancelled(err: unknown): boolean {
  const e = err as { name?: string; code?: string } | null
  return !!e && (e.name === 'AbortError' || e.code === 'ERROR_CEREMONY_ABORTED' || e.name === 'NotAllowedError')
}

/** A sentence for a failed ceremony (simplewebauthn WebAuthnError codes and DOMException names). */
export function describeWebAuthnError(err: unknown): string {
  const e = err as { name?: string; code?: string; message?: string } | null
  switch (e?.code) {
    case 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED':
      return 'This device or password manager already has a passkey for this site.'
    case 'ERROR_INVALID_DOMAIN':
    case 'ERROR_INVALID_RP_ID':
      return 'Passkeys don’t work on this address. Open the admin through the site’s own address.'
    case 'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT':
      return 'This authenticator can’t verify you (no PIN or biometrics). Use a passkey that can.'
    case 'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT':
      return 'This authenticator can’t store a passkey. Use your phone, computer or password manager instead.'
    case 'ERROR_CEREMONY_ABORTED':
      return 'The passkey request was cancelled.'
    default:
      break
  }
  if (e?.name === 'NotAllowedError') return 'The passkey prompt was closed or timed out.'
  if (e?.name === 'SecurityError') return 'The browser refused the passkey request on this address.'
  return e?.message ? `The passkey request failed: ${e.message}` : 'The passkey request failed.'
}
