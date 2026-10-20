import { withApi } from '../../../../lib/apiHandler'
import { orcidConnectionRoute } from '../../../../lib/orcid/connectRoute'

/**
 * GET /api/admin/orcid/connection — whether "Connect your ORCID iD" is set
 * up on the server (no secrets in the answer); DELETE — disconnect (the
 * authenticated marker goes, the iD stays). Documented in
 * lib/orcid/connectRoute.ts.
 */
export default withApi('admin/orcid/connection', orcidConnectionRoute())
