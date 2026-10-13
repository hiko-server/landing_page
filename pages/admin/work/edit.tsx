import { Checkbox, FormControl, FormHelperText, FormLabel, Input, Select, SimpleGrid, Stack } from '@chakra-ui/react'
import { AdminDirtyProvider } from '../../../components/Admin/AdminDirtyContext'
import { MONO, inputProps } from '../../../components/Admin/shell/ui'
import CoverImageField from '../../../components/Admin/shell/CoverImageField'
import { useMdxItemEditor } from '../../../components/Admin/shell/useMdxItemEditor'
import MdxItemEditorFrame from '../../../components/Admin/editor/MdxItemEditorFrame'
import { DESCRIPTION_MAX, TITLE_MAX } from '../../../components/Admin/shell/publishChecks'
import {
  WORK_EMPTY,
  WORK_STATUSES,
  workFromServer,
  workToServer,
  type WorkFrontmatter,
  type WorkStatus,
} from '../../../components/Admin/shell/itemFrontmatter'

function WorkEditor() {
  const ed = useMdxItemEditor<WorkFrontmatter>({
    collection: 'work',
    endpoint: '/api/admin/work',
    noun: 'case study',
    empty: WORK_EMPTY,
    listField: 'tech',
    fromServer: workFromServer,
    toServer: workToServer,
  })
  const { fm, setFm } = ed

  return (
    <MdxItemEditorFrame
      ed={ed}
      collection="work"
      noun="case study"
      backHref="/admin/work"
      backLabel="← All case studies"
      newTitle="New case study"
      fields={
        <Stack spacing={4}>
          <FormControl isRequired>
            <FormLabel fontSize="13px" htmlFor="item-title">
              Title
            </FormLabel>
            <Input {...inputProps} id="item-title" value={fm.title} onChange={(e) => setFm({ ...fm, title: e.target.value })} />
            <FormHelperText fontSize="xs" color={fm.title.length > TITLE_MAX ? 'orange.400' : 'page.fg-secondary'} className="tnum">
              {fm.title.length}/{TITLE_MAX}
            </FormHelperText>
          </FormControl>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl isRequired>
              <FormLabel fontSize="13px" htmlFor="item-slug">
                Slug
              </FormLabel>
              <Input
                {...inputProps}
                id="item-slug"
                value={ed.slug}
                placeholder="my-project"
                onChange={(e) => ed.setSlug(e.target.value.trim().toLowerCase())}
                isReadOnly={!ed.isNew}
                fontFamily={MONO}
                fontSize="14px"
                autoComplete="off"
                spellCheck={false}
              />
              <FormHelperText fontSize="xs" color={ed.slugHint ? 'orange.400' : 'page.fg-secondary'}>
                {ed.slugHint
                  ? `${ed.slugHint} — the title has no English words to build one from.`
                  : ed.isNew
                    ? 'Follows the title until you edit it. a–z, 0–9, - and _; becomes /work/<slug> and can’t be changed later.'
                    : `Published at /work/${ed.slug}`}
              </FormHelperText>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="13px" htmlFor="item-period">
                Period
              </FormLabel>
              <Input
                {...inputProps}
                id="item-period"
                value={fm.period}
                onChange={(e) => setFm({ ...fm, period: e.target.value })}
                placeholder="2024 — Now"
              />
            </FormControl>
          </SimpleGrid>

          <FormControl>
            <FormLabel fontSize="13px" htmlFor="item-description">
              Description
            </FormLabel>
            <Input
              {...inputProps}
              id="item-description"
              value={fm.description}
              onChange={(e) => setFm({ ...fm, description: e.target.value })}
              placeholder="One-line summary of the project"
            />
            <FormHelperText fontSize="xs" color={fm.description.length > DESCRIPTION_MAX ? 'orange.400' : 'page.fg-secondary'} className="tnum">
              {fm.description.length}/{DESCRIPTION_MAX} · 50–160 reads best in previews
            </FormHelperText>
          </FormControl>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel fontSize="13px" htmlFor="item-role">
                Role
              </FormLabel>
              <Input
                {...inputProps}
                id="item-role"
                value={fm.role}
                onChange={(e) => setFm({ ...fm, role: e.target.value })}
                placeholder="Co-founder / Engineer"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="13px" htmlFor="item-status">
                Status
              </FormLabel>
              <Select
                {...inputProps}
                id="item-status"
                value={fm.status}
                onChange={(e) => setFm({ ...fm, status: e.target.value as WorkStatus })}
              >
                {WORK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </FormControl>
          </SimpleGrid>

          <FormControl>
            <FormLabel fontSize="13px" htmlFor="item-tech">
              Tech (comma-separated)
            </FormLabel>
            <Input
              {...inputProps}
              id="item-tech"
              value={ed.listText}
              onChange={(e) => ed.setListText(e.target.value)}
              onBlur={ed.commitList}
              placeholder="Next.js, FastAPI, MongoDB"
            />
          </FormControl>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel fontSize="13px" htmlFor="item-link">
                Live URL
              </FormLabel>
              <Input
                {...inputProps}
                id="item-link"
                type="url"
                inputMode="url"
                value={fm.link}
                onChange={(e) => setFm({ ...fm, link: e.target.value })}
                placeholder="https://…"
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="13px" htmlFor="item-repo">
                Repo URL
              </FormLabel>
              <Input
                {...inputProps}
                id="item-repo"
                type="url"
                inputMode="url"
                value={fm.repo}
                onChange={(e) => setFm({ ...fm, repo: e.target.value })}
                placeholder="https://github.com/…"
              />
            </FormControl>
          </SimpleGrid>

          <Checkbox colorScheme="accent" isChecked={fm.featured} onChange={(e) => setFm({ ...fm, featured: e.target.checked })}>
            Featured — highlighted in the /work index
          </Checkbox>

          <CoverImageField
            inputId="item-cover"
            value={fm.cover}
            onChange={(cover) => setFm((f) => ({ ...f, cover }))}
            alt={fm.coverAlt}
            onAltChange={(coverAlt) => setFm((f) => ({ ...f, coverAlt }))}
          />
        </Stack>
      }
    />
  )
}

export default function AdminWorkEdit() {
  return (
    <AdminDirtyProvider>
      <WorkEditor />
    </AdminDirtyProvider>
  )
}
