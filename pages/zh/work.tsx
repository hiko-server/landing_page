import type { GetStaticProps } from 'next'
import WorkIndex, { type Props } from '../work'

/**
 * /zh/work — the case studies in Chinese (F3) and "全部项目", the projects
 * of the Chinese CV, with the page in Chinese (lib/uiStrings/lists) and
 * <html lang="zh-Hans">. It exists only while a Chinese case study is
 * published (404 otherwise); /work ⇄ /zh/work carry reciprocal hreflang
 * alternates and the header's language switch. Statically generated (ISR,
 * lib/indexPages).
 */
export default WorkIndex

export const getStaticProps: GetStaticProps<Props> = async () => (await import('../../lib/indexPages')).loadWorkIndex('zh-Hans')
