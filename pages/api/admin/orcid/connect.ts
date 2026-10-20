import { withApi } from '../../../../lib/apiHandler'
import { orcidConnectRoute } from '../../../../lib/orcid/connectRoute'

/**
 * GET /api/admin/orcid/connect — "Connect your ORCID iD" in CV Studio:
 * a signed-in admin is sent to ORCID's sign-in page (scope /authenticate)
 * with a fresh, session-bound state. Documented in lib/orcid/connectRoute.ts.
 */
export default withApi('admin/orcid/connect', orcidConnectRoute())
