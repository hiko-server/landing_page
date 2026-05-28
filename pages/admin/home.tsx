import type { GetServerSideProps } from 'next'

// /admin/home was the original standalone homepage editor. It now lives as a
// tab inside /admin/dashboard so all admin surfaces share one shell. Keep the
// route as a redirect so any bookmarks still land on the live editor.

export default function AdminHomeRedirect() {
  return null
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/admin/dashboard?tab=home', permanent: false },
})
