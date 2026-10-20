import type { GetStaticProps } from 'next'
import Head from 'next/head'

import LandingContent from '../components/LandingPage/LandingContent'
import HeaderFooter from '../layout/HeaderFooter'
import CustomHead from '../components/General-UI/CustomHead'
import { HERO_AVIF_SRCSET, HERO_SIZES } from '../components/Background/HeroAmbient'
import { absUrl, websiteNode, personNode, profilePageNode } from '../lib/schema'
import { HOME_DESCRIPTION } from '../lib/homeDescription'
import { ogPresetUrl } from '../lib/og/presets'
import type { HomePageProps } from '../lib/homePage'

export type Props = HomePageProps

/**
 * The home page. /zh (pages/zh/index.tsx, F3) renders this page in Chinese:
 * the owner's Chinese copy, the Chinese CV and the posts and case studies in
 * Chinese, the interface in Chinese (`ui`, lib/uiStrings/home). Data and
 * regeneration: lib/homePage.
 */
const LandingPage = ({
  home,
  cv,
  identity,
  autoCoding,
  meta,
  work,
  avatar,
  photos,
  github,
  writing,
  publications,
  personFacts,
  ui,
  lang,
  alternates,
  links,
  nameZh,
  descriptionZh,
  role,
}: Props) => {
  const zh = lang !== 'en'
  const path = zh ? '/zh' : '/'
  return (
    <>
      <CustomHead
        home
        jobTitle={zh ? role : undefined}
        lang={lang}
        nameZh={nameZh}
        description={zh ? descriptionZh : HOME_DESCRIPTION}
        url={absUrl(path)}
        image={ogPresetUrl('home')}
        type="profile"
        alternates={alternates}
        jsonLd={[websiteNode(), profilePageNode({ path, lang, dateModified: personFacts.dateModified }), personNode(personFacts)]}
      />
      <Head>
        {/* The hero backdrop is the LCP element: fetch it with the HTML. AVIF
            matches the <source> nearly every browser picks; a browser without
            AVIF ignores a typed preload and uses the WebP <img>. */}
        <link
          key="hero-preload"
          rel="preload"
          as="image"
          type="image/avif"
          imageSrcSet={HERO_AVIF_SRCSET}
          imageSizes={HERO_SIZES}
          {...{ fetchpriority: 'high' }}
        />
      </Head>

      <HeaderFooter>
        <LandingContent
          home={home}
          cv={cv}
          identity={identity}
          autoCoding={autoCoding}
          meta={meta}
          work={work}
          avatar={avatar}
          photos={photos}
          github={github}
          writing={writing}
          publications={publications}
          ui={ui}
          lang={lang}
          links={links}
        />
      </HeaderFooter>
    </>
  )
}

export default LandingPage

export const getStaticProps: GetStaticProps<Props> = async () => (await import('../lib/homePage')).loadHomePage('en')
