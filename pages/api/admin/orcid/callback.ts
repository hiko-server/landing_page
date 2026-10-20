import { withApi } from '../../../../lib/apiHandler'
import { orcidCallbackRoute } from '../../../../lib/orcid/connectRoute'

/**
 * GET /api/admin/orcid/callback — ORCID's redirect URI. Acts only for the
 * signed, single-use flow an admin session started (the proxy lets it
 * through without the SameSite=Strict session cookie, which the browser does
 * not send on the way back from orcid.org). Documented in
 * lib/orcid/connectRoute.ts.
 */
export default withApi('admin/orcid/callback', orcidCallbackRoute())
