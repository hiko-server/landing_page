/**
 * A software WebAuthn authenticator for unit tests: a real P-256 key pair,
 * real CBOR attestation objects ("none" attestation), real authenticator data
 * and ECDSA signatures — so lib/adminAuth/passkeys.ts is exercised through
 * @simplewebauthn/server exactly as a browser's passkey would.
 * Not a test file itself (tests/*.test.ts import it).
 */
import crypto from 'node:crypto'

type CborValue = number | string | Uint8Array | Map<number | string, CborValue>

function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n])
  if (n < 0x100) return Buffer.from([(major << 5) | 24, n])
  if (n < 0x10000) {
    const b = Buffer.alloc(3)
    b[0] = (major << 5) | 25
    b.writeUInt16BE(n, 1)
    return b
  }
  const b = Buffer.alloc(5)
  b[0] = (major << 5) | 26
  b.writeUInt32BE(n, 1)
  return b
}

/** Minimal CBOR encoder: unsigned / negative ints, byte and text strings, maps. */
export function cbor(v: CborValue): Buffer {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v)
  if (typeof v === 'string') {
    const s = Buffer.from(v, 'utf8')
    return Buffer.concat([head(3, s.length), s])
  }
  if (v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)])
  const parts: Buffer[] = [head(5, v.size)]
  for (const [k, val] of v) parts.push(cbor(k), cbor(val))
  return Buffer.concat(parts)
}

const b64u = (b: Uint8Array | string) => Buffer.from(b).toString('base64url')
const sha256 = (b: Uint8Array | string) => crypto.createHash('sha256').update(b).digest()

const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_BE = 0x08
const FLAG_BS = 0x10
const FLAG_AT = 0x40

export type SoftAuthenticatorOptions = {
  /** Synced passkey (backup eligible + backed up). */
  synced?: boolean
  /** Report user verification (biometrics / PIN). */
  userVerified?: boolean
  aaguid?: string
}

export class SoftAuthenticator {
  readonly credentialId: Buffer
  readonly id: string
  private readonly keys: crypto.KeyPairKeyObjectResult
  private counter = 0
  private readonly opts: Required<SoftAuthenticatorOptions>
  userHandle: string | null = null

  constructor(opts: SoftAuthenticatorOptions = {}) {
    this.credentialId = crypto.randomBytes(32)
    this.id = b64u(this.credentialId)
    this.keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    this.opts = { synced: true, userVerified: true, aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd', ...opts }
  }

  private flags(extra: number): number {
    let f = FLAG_UP | extra
    if (this.opts.userVerified) f |= FLAG_UV
    if (this.opts.synced) f |= FLAG_BE | FLAG_BS
    return f
  }

  private coseKey(): Buffer {
    const jwk = this.keys.publicKey.export({ format: 'jwk' }) as { x: string; y: string }
    return cbor(
      new Map<number, CborValue>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x, 'base64url')],
        [-3, Buffer.from(jwk.y, 'base64url')],
      ]),
    )
  }

  /** A registration response for creation options (as @simplewebauthn/browser would send it). */
  register(options: { challenge: string; rp: { id?: string }; user: { id: string } }, origin: string, rpId = options.rp.id || '') {
    const clientDataJSON = JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin, crossOrigin: false })
    const counter = Buffer.alloc(4)
    counter.writeUInt32BE(this.counter, 0)
    const idLen = Buffer.alloc(2)
    idLen.writeUInt16BE(this.credentialId.length, 0)
    const authData = Buffer.concat([
      sha256(rpId),
      Buffer.from([this.flags(FLAG_AT)]),
      counter,
      Buffer.from(this.opts.aaguid.replace(/-/g, ''), 'hex'),
      idLen,
      this.credentialId,
      this.coseKey(),
    ])
    const attestationObject = cbor(
      new Map<string, CborValue>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    )
    this.userHandle = options.user.id
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject), transports: ['internal', 'hybrid'] },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform' as const,
    }
  }

  /** An assertion for request options. `counterStep` 0 replays the previous counter (a clone). */
  authenticate(options: { challenge: string; rpId?: string }, origin: string, rpId = options.rpId || '', counterStep = 1) {
    this.counter += counterStep
    const clientDataJSON = JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin, crossOrigin: false })
    const counter = Buffer.alloc(4)
    counter.writeUInt32BE(this.counter, 0)
    const authenticatorData = Buffer.concat([sha256(rpId), Buffer.from([this.flags(0)]), counter])
    const signature = crypto.sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), this.keys.privateKey)
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authenticatorData),
        signature: b64u(signature),
        userHandle: this.userHandle || undefined,
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform' as const,
    }
  }
}
