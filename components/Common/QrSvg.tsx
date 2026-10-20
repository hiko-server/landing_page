import { useMemo } from 'react'
import { qrShape } from '../../lib/qrShape'

/**
 * A QR code from lib/qr.ts (`qrSvg`, rendered on the server) drawn as SVG
 * elements: the modules stroked in `currentColor`, sized by the parent
 * (`& svg { width: 100%; height: 100% }`), hidden from assistive tech (the
 * parent carries role="img" and the label). Rendering elements rather than
 * `dangerouslySetInnerHTML` keeps the markup out of innerHTML, a Trusted
 * Types sink, when the QR appears after hydration (the WeChat share panel,
 * client-side navigation to /cv or /contact).
 */
export default function QrSvg({ svg }: { svg: string }) {
  const shape = useMemo(() => qrShape(svg), [svg])
  if (!shape) return null
  return (
    <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox={shape.viewBox} shapeRendering="crispEdges">
      {shape.paths.map((d, i) => (
        <path key={i} stroke="currentColor" d={d} />
      ))}
    </svg>
  )
}
