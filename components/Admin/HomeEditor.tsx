import React, { useEffect, useState } from 'react'
import { Button, Checkbox, FormControl, FormLabel, Heading, HStack, IconButton, Image, Input, SimpleGrid, Table, Tbody, Td, Th, Thead, Tr, Textarea, useToast } from '@chakra-ui/react'
import { AddIcon, DeleteIcon } from '@chakra-ui/icons'

type Brand = { name: string; href: string; image: string }
type Quick = { label: string; url: string }

export default function HomeEditor() {
  const toast = useToast()
  const [hero, setHero] = useState({ welcome: '', brand: '', tagline: '', avatarUrl: '', phone: '', email: '' })
  const [socials, setSocials] = useState({ github: '', gitlab: '', linkedin: '', whatsapp: '' })
  const [brands, setBrands] = useState<Brand[]>([])
  const [quickAccess, setQuick] = useState<Quick[]>([])
  const [photos, setPhotos] = useState<{ url: string; describe?: string; redirectTo?: string; visible?: boolean }[]>([])

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/home')
      const data = await res.json()
      if (data) {
        setHero({ welcome: data.hero?.welcome || 'Welcome to', brand: data.hero?.brand || 'HIKO.DEV', tagline: data.hero?.tagline || '', avatarUrl: data.hero?.avatarUrl || '', phone: data.hero?.phone || '', email: data.hero?.email || '' })
        setSocials({ github: data.socials?.github || '', gitlab: data.socials?.gitlab || '', linkedin: data.socials?.linkedin || '', whatsapp: data.socials?.whatsapp || '' })
        setBrands(Array.isArray(data.brands) ? data.brands : [])
        setQuick(Array.isArray(data.quickAccess) ? data.quickAccess : [])
        setPhotos(Array.isArray(data.photos) ? data.photos : [])
      }
    }
    load()
  }, [])

  const normalizeUrl = (u?: string) => {
    if (!u) return ''
    if (/^https?:\/\//i.test(u)) return u
    if (u.startsWith('/')) return u
    return '/' + u.replace(/^\.?\/*/, '')
  }

  const save = async () => {
    const payload = {
      hero: { ...hero, avatarUrl: normalizeUrl(hero.avatarUrl) },
      socials,
      brands: (brands || []).map(b => ({ ...b, image: normalizeUrl(b.image) })),
      quickAccess,
      photos: (photos || []).map(p => ({
        ...p,
        url: normalizeUrl(p.url),
        redirectTo: p.redirectTo ? normalizeUrl(p.redirectTo) : undefined,
      })),
    }
    const res = await fetch('/api/home', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (res.ok) toast({ status: 'success', title: 'Saved' })
    else toast({ status: 'error', title: 'Save failed (login?)' })
  }

  const validateUrl = (u: string) => /^\//.test(u) || /^https?:\/\//i.test(u)
  const onUpload = async (file: File, setter: (url: string) => void) => {
    if (file.size > 8 * 1024 * 1024) {
      toast({ status: 'error', title: 'File too large (>8MB)' })
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      let dataUrl = reader.result as string
      try {
        dataUrl = await compressImageDataUrl(dataUrl, 1200, 800, 0.8)
      } catch {}
      const res = await fetch('/api/admin/upload-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, dataUrl }) })
      const data = await res.json()
      if (res.ok) {
        setter(data.url)
        toast({ status: 'success', title: 'Image uploaded' })
      } else {
        toast({ status: 'error', title: data?.error || 'Upload failed' })
      }
    }
    reader.readAsDataURL(file)
  }

  async function compressImageDataUrl(srcDataUrl: string, maxW: number, maxH: number, quality: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new window.Image()
      img.onload = () => {
        let { width, height } = img as any
        const ratio = Math.min(maxW / width, maxH / height, 1)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(srcDataUrl)
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => resolve(srcDataUrl)
      img.src = srcDataUrl
    })
  }

  return (
    <>
      <Heading size="sm">Hero</Heading>
      <SimpleGrid columns={[1, 2]} gap={4}>
        <FormControl>
          <FormLabel>Welcome</FormLabel>
          <Input value={hero.welcome} onChange={(e) => setHero({ ...hero, welcome: e.target.value })} />
        </FormControl>
        <FormControl>
          <FormLabel>Brand</FormLabel>
          <Input value={hero.brand} onChange={(e) => setHero({ ...hero, brand: e.target.value })} />
        </FormControl>
        <FormControl gridColumn="1 / -1">
          <FormLabel>Tagline</FormLabel>
          <Textarea value={hero.tagline} onChange={(e) => setHero({ ...hero, tagline: e.target.value })} />
        </FormControl>
        <FormControl>
          <FormLabel>Avatar URL</FormLabel>
          <Input value={hero.avatarUrl} onChange={(e) => setHero({ ...hero, avatarUrl: e.target.value })} />
        </FormControl>
        <FormControl>
          <FormLabel>Upload Avatar</FormLabel>
          <Input type="file" accept="image/*" onChange={(e) => { const f=e.target.files?.[0]; if (f) onUpload(f, (url)=> setHero({ ...hero, avatarUrl: url })) }} />
        </FormControl>
        <FormControl>
          <FormLabel>Phone</FormLabel>
          <Input value={hero.phone} onChange={(e) => setHero({ ...hero, phone: e.target.value })} />
        </FormControl>
        <FormControl>
          <FormLabel>Email</FormLabel>
          <Input value={hero.email} onChange={(e) => setHero({ ...hero, email: e.target.value })} />
        </FormControl>
      </SimpleGrid>

      <Heading size="sm" mt={6}>Socials</Heading>
      <SimpleGrid columns={[1, 2]} gap={4}>
        <FormControl><FormLabel>GitHub</FormLabel><Input value={socials.github} onChange={(e)=> setSocials({...socials, github:e.target.value})} /></FormControl>
        <FormControl><FormLabel>GitLab</FormLabel><Input value={socials.gitlab} onChange={(e)=> setSocials({...socials, gitlab:e.target.value})} /></FormControl>
        <FormControl><FormLabel>LinkedIn</FormLabel><Input value={socials.linkedin} onChange={(e)=> setSocials({...socials, linkedin:e.target.value})} /></FormControl>
        <FormControl><FormLabel>WhatsApp</FormLabel><Input value={socials.whatsapp} onChange={(e)=> setSocials({...socials, whatsapp:e.target.value})} /></FormControl>
      </SimpleGrid>

      <Heading size="sm" mt={6}>Brands</Heading>
      <Table variant="simple">
        <Thead><Tr><Th>Name</Th><Th>Link</Th><Th>Image</Th><Th>Upload</Th><Th></Th></Tr></Thead>
        <Tbody>
          {brands.map((b, idx) => (
            <Tr key={idx}>
              <Td><Input value={b.name} onChange={(e)=>{ const arr=[...brands]; arr[idx]={...arr[idx], name:e.target.value}; setBrands(arr) }} /></Td>
              <Td><Input value={b.href} onChange={(e)=>{ const arr=[...brands]; arr[idx]={...arr[idx], href:e.target.value}; setBrands(arr) }} /></Td>
              <Td>
                <Input value={b.image} onChange={(e)=>{ const arr=[...brands]; arr[idx]={...arr[idx], image:e.target.value}; setBrands(arr) }} />
              </Td>
              <Td>
                <Input type="file" accept="image/*" onChange={(e)=> { const f=e.target.files?.[0]; if (f) onUpload(f, (url)=>{ const arr=[...brands]; arr[idx]={...arr[idx], image:url}; setBrands(arr) }) }} />
              </Td>
              <Td><IconButton aria-label="delete" icon={<DeleteIcon/>} onClick={()=> setBrands(brands.filter((_,i)=> i!==idx))} /></Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button leftIcon={<AddIcon/>} onClick={()=> setBrands([...brands, { name:'', href:'', image:'' }])}>Add Brand</Button>

      <Heading size="sm" mt={6}>Quick Access</Heading>
      <Table variant="simple">
        <Thead><Tr><Th>Label</Th><Th>URL</Th><Th></Th></Tr></Thead>
        <Tbody>
          {quickAccess.map((q, idx) => (
            <Tr key={idx}>
              <Td><Input value={q.label} onChange={(e)=>{ const arr=[...quickAccess]; arr[idx]={...arr[idx], label:e.target.value}; setQuick(arr) }} /></Td>
              <Td><Input value={q.url} onChange={(e)=>{ const arr=[...quickAccess]; arr[idx]={...arr[idx], url:e.target.value}; setQuick(arr) }} /></Td>
              <Td><IconButton aria-label="delete" icon={<DeleteIcon/>} onClick={()=> setQuick(quickAccess.filter((_,i)=> i!==idx))} /></Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button leftIcon={<AddIcon/>} onClick={()=> setQuick([...quickAccess, { label:'', url:'' }])}>Add Quick Link</Button>

      <Heading size="sm" mt={6}>Photos</Heading>
      <Table variant="simple">
        <Thead><Tr><Th>#</Th><Th>Preview</Th><Th>Image URL</Th><Th>Description</Th><Th>Link</Th><Th>Visible</Th><Th>Upload</Th><Th>Order</Th><Th></Th></Tr></Thead>
        <Tbody>
          {photos.map((p, idx) => (
            <Tr key={idx}
              draggable
              onDragStart={(e)=> e.dataTransfer.setData('text/plain', String(idx))}
              onDragOver={(e)=> e.preventDefault()}
              onDrop={(e)=> { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); if (Number.isNaN(from)) return; const arr=[...photos]; const [moved]=arr.splice(from,1); arr.splice(idx,0,moved); setPhotos(arr) }}
            >
              <Td>{idx+1}</Td>
              <Td>{p.url ? <Image src={normalizeUrl(p.url)} alt="preview" boxSize="60px" objectFit="cover" /> : null}</Td>
              <Td><Input value={p.url} onChange={(e)=>{ const val=e.target.value; const arr=[...photos]; arr[idx]={...arr[idx], url:val}; setPhotos(arr) }} isInvalid={!!p.url && !validateUrl(p.url)} /></Td>
              <Td><Input value={p.describe || ''} onChange={(e)=>{ const arr=[...photos]; arr[idx]={...arr[idx], describe:e.target.value}; setPhotos(arr) }} /></Td>
              <Td><Input value={p.redirectTo || ''} onChange={(e)=>{ const val=e.target.value; const arr=[...photos]; arr[idx]={...arr[idx], redirectTo:val}; setPhotos(arr) }} isInvalid={!!p.redirectTo && !validateUrl(p.redirectTo)} /></Td>
              <Td><Checkbox isChecked={p.visible !== false} onChange={(e)=>{ const arr=[...photos]; arr[idx]={...arr[idx], visible:e.target.checked}; setPhotos(arr) }}>Visible</Checkbox></Td>
              <Td><Input type="file" accept="image/*" onChange={(e)=> { const f=e.target.files?.[0]; if (f) onUpload(f, (url)=>{ const arr=[...photos]; arr[idx]={...arr[idx], url}; setPhotos(arr) }) }} /></Td>
              <Td>
                <HStack>
                  <Button size="sm" onClick={()=> { if (idx===0) return; const arr=[...photos]; const t=arr[idx-1]; arr[idx-1]=arr[idx]; arr[idx]=t; setPhotos(arr) }}>↑</Button>
                  <Button size="sm" onClick={()=> { if (idx===photos.length-1) return; const arr=[...photos]; const t=arr[idx+1]; arr[idx+1]=arr[idx]; arr[idx]=t; setPhotos(arr) }}>↓</Button>
                </HStack>
              </Td>
              <Td><IconButton aria-label="delete" icon={<DeleteIcon/>} onClick={()=> setPhotos(photos.filter((_,i)=> i!==idx))} /></Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Button leftIcon={<AddIcon/>} onClick={()=> setPhotos([...(photos||[]), { url:'', describe:'', redirectTo:'', visible:true }])}>Add Photo</Button>

      <HStack mt={6}><Button colorScheme="blue" onClick={()=>{
        for (const p of photos) {
          if (p.url && !validateUrl(p.url)) { toast({status:'error', title:'Invalid photo URL'}); return }
          if (p.redirectTo && !validateUrl(p.redirectTo)) { toast({status:'error', title:'Invalid link URL'}); return }
        }
        save()
      }}>Save All</Button></HStack>
    </>
  )
}
