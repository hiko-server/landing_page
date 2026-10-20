import { AdminPageShell, BackLink } from '../../components/Admin/shell/ui'
import PublishingOverview from '../../components/Admin/publishing/PublishingOverview'

/**
 * Admin → Scheduled & review links (H5): what publishes, goes live or
 * unpublishes on its own, the scheduler's state, and every active review
 * link (components/Admin/publishing/PublishingOverview).
 */
export default function AdminPublishing() {
  return (
    <AdminPageShell headTitle="Admin · Scheduled & review links" eyebrow="[admin] content" title="Scheduled & review links" actions={<BackLink href="/admin">← Admin</BackLink>}>
      <PublishingOverview />
    </AdminPageShell>
  )
}
