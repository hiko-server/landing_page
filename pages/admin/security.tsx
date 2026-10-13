import { AdminPageShell } from '../../components/Admin/shell/ui'
import SecurityPanel from '../../components/Admin/security/SecurityPanel'

/** Admin → Security: passkeys, recovery codes, sign-in policy, sessions and history. */
export default function AdminSecurity() {
  return (
    <AdminPageShell headTitle="Admin · Security" eyebrow="[admin]" title="Security">
      <SecurityPanel />
    </AdminPageShell>
  )
}
