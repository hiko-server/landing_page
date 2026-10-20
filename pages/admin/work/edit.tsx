import { useMemo, useState } from 'react'
import { Box, Checkbox, FormControl, FormHelperText, FormLabel, Input, Select, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import { AdminDirtyProvider } from '../../../components/Admin/AdminDirtyContext'
import { MONO, inputProps } from '../../../components/Admin/shell/ui'
import CoverImageField, { type CoverSize } from '../../../components/Admin/shell/CoverImageField'
import { LinksField, OutcomesField } from '../../../components/Admin/shell/GlanceFields'
import { useMdxItemEditor } from '../../../components/Admin/shell/useMdxItemEditor'
import MdxItemEditorFrame from '../../../components/Admin/editor/MdxItemEditorFrame'
import SlugField from '../../../components/Admin/editor/SlugField'
import CaseStudyTemplateCard from '../../../components/Admin/editor/CaseStudyTemplateCard'
import { DESCRIPTION_MAX, TITLE_MAX } from '../../../components/Admin/shell/publishChecks'
import { SUMMARY_MAX, TEAM_MAX } from '../../../lib/caseStudy'
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
  const [coverSize, setCoverSize] = useState<CoverSize | null>(null)
  const publishExtra = useMemo(
    () => ({ coverWidth: coverSize?.width ?? null, summary: fm.summary, outcomes: fm.outcomes }),
    [coverSize, fm.summary, fm.outcomes],
  )

  return (
    <MdxItemEditorFrame
      ed={ed}
      collection="work"
      noun="case study"
      backHref="/admin/work"
      backLabel="← All case studies"
      newTitle="New case study"
      publishExtra={publishExtra}
      aboveBody={<CaseStudyTemplateCard body={ed.body} onInsert={(template) => ed.setBody(template)} />}
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
            <SlugField ed={ed} collection="work" placeholder="my-project" />
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

          <Box as="fieldset" border="1px solid" borderColor="page.border" borderRadius="lg" p={{ base: 4, md: 5 }} m={0}>
            <Box as="legend" px={2} fontFamily={MONO} fontSize="11px" letterSpacing="0.12em" textTransform="uppercase" color="page.fg-secondary">
              At a glance
            </Box>
            <Text fontSize="xs" color="page.fg-secondary" mb={4}>
              Shown under the title of the case study, before the story — only what you fill in. The first metric also appears on the /work card.
            </Text>
            <Stack spacing={5}>
              <FormControl>
                <FormLabel fontSize="13px" htmlFor="item-summary">
                  Outcome in one sentence
                </FormLabel>
                <Input
                  {...inputProps}
                  id="item-summary"
                  value={fm.summary}
                  maxLength={SUMMARY_MAX}
                  onChange={(e) => setFm({ ...fm, summary: e.target.value })}
                  placeholder="What changed because of the project"
                />
                <FormHelperText fontSize="xs" color="page.fg-secondary" className="tnum">
                  {fm.summary.length}/{SUMMARY_MAX}
                </FormHelperText>
              </FormControl>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl>
                  <FormLabel fontSize="13px" htmlFor="item-team">
                    Team
                  </FormLabel>
                  <Input {...inputProps} id="item-team" value={fm.team} maxLength={TEAM_MAX} onChange={(e) => setFm({ ...fm, team: e.target.value })} placeholder="Solo / Team of 4" />
                </FormControl>
                <FormControl>
                  <FormLabel fontSize="13px" htmlFor="item-published">
                    Published
                  </FormLabel>
                  <Input {...inputProps} id="item-published" type="date" value={fm.published} onChange={(e) => setFm({ ...fm, published: e.target.value })} />
                  <FormHelperText fontSize="xs" color="page.fg-secondary">
                    When this case study was first published (shown in the details and search data).
                  </FormHelperText>
                </FormControl>
              </SimpleGrid>
              <Box id="item-outcomes" tabIndex={-1} _focusVisible={{ outline: 'none' }}>
                <OutcomesField value={fm.outcomes} onChange={(outcomes) => setFm((f) => ({ ...f, outcomes }))} />
              </Box>
              <LinksField value={fm.links} onChange={(links) => setFm((f) => ({ ...f, links }))} />
            </Stack>
          </Box>

          <CoverImageField
            inputId="item-cover"
            value={fm.cover}
            onChange={(cover) => setFm((f) => ({ ...f, cover }))}
            alt={fm.coverAlt}
            onAltChange={(coverAlt) => setFm((f) => ({ ...f, coverAlt }))}
            focus={fm.coverFocus}
            onFocusChange={(coverFocus) => setFm((f) => ({ ...f, coverFocus }))}
            onMeasure={setCoverSize}
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
