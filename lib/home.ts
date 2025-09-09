import fs from 'fs'
import path from 'path'

export type HomeData = {
  hero: {
    welcome: string
    brand: string
    tagline: string
    avatarUrl: string
    phone?: string
    email?: string
  }
  socials: {
    github?: string
    gitlab?: string
    linkedin?: string
    whatsapp?: string
  }
  brands: { name: string; href: string; image: string }[]
  quickAccess: { label: string; url: string }[]
  photos?: { url: string; describe?: string; redirectTo?: string; visible?: boolean }[]
}

const homePath = path.join(process.cwd(), 'data', 'home.json')

export function readHome(): HomeData | null {
  try {
    const raw = fs.readFileSync(homePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function writeHome(data: HomeData) {
  fs.mkdirSync(path.dirname(homePath), { recursive: true })
  fs.writeFileSync(homePath, JSON.stringify(data, null, 2), 'utf-8')
}
