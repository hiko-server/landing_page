import MediaLibrary from '../../components/Admin/media/MediaLibrary'

/**
 * Admin → Media (H7): every uploaded image with search and filters, where
 * each one is used, its default alt text and caption, responsive versions,
 * R2 state, replace, safe delete and the 30-day trash.
 *   /admin/media                 the library
 *   /admin/media?open=<name>     with one image's details open
 *   /admin/media?view=trash      the trash
 */
export default function AdminMedia() {
  return <MediaLibrary />
}
