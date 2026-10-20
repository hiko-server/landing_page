import { useRouter } from 'next/router'
import { Skeleton, Stack } from '@chakra-ui/react'
import PageEditor, { type PageLanguage } from '../../components/Admin/PageEditor'

/** The bio in each language (F3): the Chinese one is what publishes /zh/about. */
const BIO_LANGUAGES: readonly PageLanguage[] = [
  { name: 'about', label: 'English', lang: 'en', href: '/admin/about' },
  { name: 'about-zh', label: '中文', lang: 'zh-Hans', href: '/admin/about?lang=zh' },
]

/** /admin/about edits the English bio, /admin/about?lang=zh the Chinese one. */
export default function AdminAbout() {
  const router = useRouter()
  // The query is known only once the router is ready: load one bio, not the English one first.
  if (!router.isReady) {
    return (
      <Stack spacing={4} p={8} aria-busy="true" aria-label="Loading the bio editor">
        <Skeleton h="40px" />
        <Skeleton h="420px" />
      </Stack>
    )
  }
  return <PageEditor name={router.query.lang === 'zh' ? 'about-zh' : 'about'} languages={BIO_LANGUAGES} />
}
