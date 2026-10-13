// Lets `node --test` run the TypeScript sources directly (Node ≥ 22.18 strips
// types natively): resolve extensionless relative imports to their .ts/.tsx file,
// and Next's root subpath modules ("next/dynamic", which has no exports map) to
// their .js file.
import { register } from 'node:module'

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      import { existsSync } from 'node:fs'
      import { fileURLToPath } from 'node:url'
      export async function resolve(specifier, context, next) {
        if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
          for (const ext of ['.ts', '.tsx', '/index.ts']) {
            const url = new URL(specifier + ext, context.parentURL)
            if (existsSync(fileURLToPath(url))) return next(url.href, context)
          }
        }
        if (/^next\\/[\\w-]+$/.test(specifier)) return next(specifier + '.js', context)
        return next(specifier, context)
      }
    `),
  import.meta.url,
)
