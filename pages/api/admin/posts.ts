import { withApi } from '../../../lib/apiHandler'
import { createCollectionApi } from '../../../lib/mdx-admin'

/**
 * Admin CRUD for blog posts (content store, collection "blog").
 *
 *   GET    /api/admin/posts                → list all (including drafts)
 *   GET    /api/admin/posts?slug=foo       → read one, ETag = its version
 *   PUT    /api/admin/posts                → { slug, frontmatter, body, create? } write;
 *                                            optional If-Match → 409 VERSION_CONFLICT;
 *                                            the body must compile → else 422 MDX_INVALID
 *   DELETE /api/admin/posts?slug=foo       → delete (auto-snapshots first)
 *
 * Successful writes regenerate /blog, /blog/<slug> and its siblings and list
 * them in `revalidated` (`revalidateFailed` names any page that could not be
 * refreshed). Implementation shared with /api/admin/work (lib/mdx-admin.ts).
 */
export default withApi('admin/posts', createCollectionApi('blog', { noun: 'post', requireDate: true }))

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }
