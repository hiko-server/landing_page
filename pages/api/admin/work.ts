import { withApi } from '../../../lib/apiHandler'
import { createCollectionApi } from '../../../lib/mdx-admin'

/**
 * Admin CRUD for project case studies (content store, collection "work").
 * Same contract as /api/admin/posts (ETag / If-Match, compile check,
 * SLUG_EXISTS, snapshots); writes regenerate /work, /work/<slug> and its
 * siblings and list them in `revalidated`.
 */
export default withApi('admin/work', createCollectionApi('work', { noun: 'case study', requireDate: false }))

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }
