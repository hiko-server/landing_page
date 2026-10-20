import { withApi } from '../../../../lib/apiHandler'
import { orcidWorksRoute } from '../../../../lib/orcid/route'

/**
 * POST /api/admin/orcid/works — the CV Studio's "Import from ORCID": the
 * public works of the owner's ORCID record as publication candidates
 * (admin only, rate-limited, in the activity log; nothing is stored).
 * The handler and its answers are documented in lib/orcid/route.ts.
 */
export default withApi('admin/orcid/works', orcidWorksRoute())
