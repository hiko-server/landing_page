import React, { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  IconButton,
  Input,
  Select,
  SimpleGrid,
  Switch,
  Text,
  Textarea,
  useToast,
  VStack,
  FormControl,
  FormLabel,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
} from '@chakra-ui/react'
import { AddIcon, DeleteIcon, DragHandleIcon, ArrowUpIcon, ArrowDownIcon } from '@chakra-ui/icons'
import { useForm, useFieldArray, Controller, useWatch, Control } from 'react-hook-form'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// -----------------------------------------------------------------------------
// Structure Overview (Compact)
// -----------------------------------------------------------------------------

const StructureOverview = ({ control, fields, move }: { control: Control<any>, fields: any[], move: (from:number, to:number)=>void }) => {
    // We watch 'sections' to get live values for toggles, names
    const sections = useWatch({ control, name: 'sections' }) || []

    return (
        <Box p={4} border="1px" borderColor="gray.200" borderRadius="md" bg="white" shadow="sm" mb={6}>
            <Heading size="sm" mb={4} color="gray.600">Structure & Visibility (Unified View)</Heading>
            <VStack align="stretch" spacing={2}>
                {fields.map((field, index) => {
                    const sectionData = sections[index] || field
                    const sessionName = sectionData.sessionName
                    // const isVisible = sectionData.isVisible !== false 

                    return (
                        <Flex key={field.id} bg="gray.50" p={2} borderRadius="md" align="center" justify="space-between" borderWidth="1px">
                             <HStack spacing={4}>
                                 <Controller
                                    control={control}
                                    name={`sections.${index}.isVisible`}
                                    defaultValue={true}
                                    render={({ field: { value, onChange } }) => (
                                        <Switch 
                                            isChecked={value !== false} 
                                            onChange={(e) => onChange(e.target.checked)} 
                                            size="md"
                                        />
                                    )}
                                 />
                                 <Box>
                                     <Text fontWeight="bold" fontSize="sm">{sectionData.headerName || sessionName}</Text>
                                     <Text fontSize="xs" color="gray.500">{sessionName}</Text>
                                 </Box>
                             </HStack>
                             
                             <HStack>
                                 <IconButton 
                                    aria-label="Move Up" 
                                    icon={<ArrowUpIcon />} 
                                    size="xs" 
                                    isDisabled={index === 0} 
                                    onClick={() => move(index, index - 1)}
                                 />
                                 <IconButton 
                                    aria-label="Move Down" 
                                    icon={<ArrowDownIcon />} 
                                    size="xs" 
                                    isDisabled={index === fields.length - 1} 
                                    onClick={() => move(index, index + 1)}
                                 />
                             </HStack>
                        </Flex>
                    )
                })}

                {/* Personal Info Sub-Toggles */}
                {(() => {
                    const piIndex = fields.findIndex((f: any) => f.sessionName === 'personalInformation')
                    if (piIndex === -1) return null
                    
                    const piData = sections[piIndex] 
                    if (!piData) return null 

                    // Define subfields we want to toggle
                    const subFields = ['firstName', 'lastName', 'nickName', 'email', 'phoneNumber', 'personalWebsite', 'address', 'introduction']

                    return (
                        <Box mt={2} p={3} bg="blue.50" borderRadius="md" borderLeft="4px solid" borderColor="blue.400">
                             <Text fontSize="xs" fontWeight="bold" mb={2} color="blue.700">Personal Info Visibility:</Text>
                             <Flex wrap="wrap" gap={4}>
                                 {subFields.map(sub => (
                                     <HStack key={sub} spacing={1}>
                                         <Controller
                                            control={control}
                                            name={`sections.${piIndex}.hiddenFields`}
                                            render={({ field: { value = [], onChange } }) => (
                                                <Switch 
                                                    size="xs" 
                                                    isChecked={!value.includes(sub)} 
                                                    onChange={(e) => {
                                                        if (e.target.checked) onChange(value.filter((h: string) => h !== sub))
                                                        else onChange([...value, sub])
                                                    }}
                                                />
                                            )}
                                         />
                                         <Text fontSize="xs">{sub}</Text>
                                     </HStack>
                                 ))}
                             </Flex>
                        </Box>
                    )
                })()}

            </VStack>
        </Box>
    )
}


// -----------------------------------------------------------------------------
// Sortable Wrapper Components
// -----------------------------------------------------------------------------

function SortableItem({ id, children, handleProps, style: customStyle }: { id: string; children: React.ReactNode, handleProps?: any, style?: any }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...customStyle
  }

  return (
    <Box ref={setNodeRef} style={style} mb={4} p={4} borderWidth="1px" borderRadius="md" bg="white" position="relative">
      <Flex direction="column" gap={2}>
        <Flex justify="space-between" align="center" mb={2}>
            <Box {...attributes} {...listeners} cursor="grab" p={1} bg="gray.100" borderRadius="md" {...handleProps}>
                <DragHandleIcon color="gray.500" />
            </Box>
            {/* Delete button or extra controls passed via children usually */}
        </Flex>
        {children}
      </Flex>
    </Box>
  )
}

// -----------------------------------------------------------------------------
// Section Component
// -----------------------------------------------------------------------------

const SectionEditor = ({ section, index, control, bilingual }: { section: any, index: number, control: Control<any>, bilingual: boolean }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: section.id })
    
    // Lift style to avoid z-index issues
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative' as const,
        zIndex: isDragging ? 999 : 1,
    }

    const sessionName = section.sessionName

    return (
        <Box ref={setNodeRef} style={style} mb={6} p={0} borderWidth="1px" borderRadius="lg" bg="white" shadow="sm">
             {/* Section Header Bar */}
             <Flex align="center" justify="space-between" bg="gray.50" p={3} borderTopRadius="lg" borderBottomWidth="1px">
                <Flex align="center" gap={3}>
                     {/* Drag Handle */}
                    <Box {...attributes} {...listeners} cursor="grab" p={2} _hover={{ bg: 'gray.200' }} borderRadius="md">
                        <DragHandleIcon />
                    </Box>
                    
                    {/* Visibility Toggle */}
                    <Controller
                        control={control}
                        name={`sections.${index}.isVisible`}
                        defaultValue={true}
                        render={({ field: { value, onChange } }) => (
                            <Switch isChecked={value !== false} onChange={(e) => onChange(e.target.checked)} title="Toggle Visibility" />
                        )}
                    />
                    
                    {/* Session Name Label (Read-only) */}
                    <Text fontWeight="bold" fontSize="sm" color="gray.500">
                        {sessionName.toUpperCase()}
                    </Text>

                    {/* Header Name Input */}
                    <Controller
                        control={control}
                        name={`sections.${index}.headerName`}
                        render={({ field }) => (
                            <Input {...field} size="sm" fontWeight="bold" bg="white" w="auto" minW="200px" />
                        )}
                    />
                </Flex>
                
                {/* Delete Section? Maybe not allow deleting core sections easily */}
                 {/* <IconButton aria-label="Delete" icon={<DeleteIcon />} size="xs" colorScheme="red" variant="ghost" onClick={() => removeSection(index)} /> */}
             </Flex>

            {/* Section Content */}
            <Box p={4}>
                {sessionName === 'personalInformation' && <PersonalInfoEditor index={index} control={control} bilingual={bilingual} />}
                {sessionName === 'education' && <EducationEditor index={index} control={control} bilingual={bilingual} />}
                {sessionName === 'skill' && <SkillEditor index={index} control={control} bilingual={bilingual} />}
                {sessionName === 'project' && <ProjectEditor index={index} control={control} bilingual={bilingual} />}
                {sessionName === 'workExperience' && <WorkExperienceEditor index={index} control={control} bilingual={bilingual} />}
                {sessionName === 'competitionAwards' && <CompetitionEditor index={index} control={control} bilingual={bilingual} />}
                {sessionName === 'extraSkill' && <ExtraSkillEditor index={index} control={control} bilingual={bilingual} />}
            </Box>
        </Box>
    )
}

// -----------------------------------------------------------------------------
// Sub-Editors
// -----------------------------------------------------------------------------

// 1. Personal Info
const PersonalInfoEditor = ({ index, control, bilingual }: any) => {
    const fields = ['firstName', 'lastName', 'nickName', 'email', 'phoneNumber', 'personalWebsite', 'address', 'introduction']
    return (
        <SimpleGrid columns={[1, 2]} gap={4}>
            {fields.map(f => (
                <FormControl key={f} gridColumn={f === 'introduction' || f === 'address' ? '1 / -1' : undefined}>
                    <Flex justify="space-between">
                        <FormLabel fontSize="sm" textTransform="capitalize" m={0} mb={1}>{f.replace(/([A-Z])/g, ' $1').trim()}</FormLabel>
                         {/* Hidden Toggle per field */}
                         <Controller
                            control={control}
                            name={`sections.${index}.hiddenFields`}
                            render={({ field: { value = [], onChange } }) => (
                                <HStack spacing={1}>
                                    <Switch size="xs" isChecked={!value.includes(f)} onChange={(e) => {
                                        if (e.target.checked) onChange(value.filter((v: string) => v !== f))
                                        else onChange([...value, f])
                                    }} />
                                    <Text fontSize="xs" color="gray.500">Show</Text>
                                </HStack>
                            )}
                        />
                    </Flex>
                    {f === 'introduction' ? (
                        <Controller control={control} name={`sections.${index}.${f}`} render={({ field }) => <Textarea {...field} rows={3} />} />
                    ) : ( 
                        <Controller control={control} name={`sections.${index}.${f}`} render={({ field }) => <Input {...field} />} /> 
                    )}
                    
                    {bilingual && (
                        <Box mt={2} pl={4} borderLeft="2px solid" borderColor="teal.100">
                             <Text fontSize="xs" color="teal.600" mb={1}>{f} (ZH)</Text>
                             {f === 'introduction' ? (
                                <Controller control={control} name={`sections.${index}.zh.${f}`} render={({ field }) => <Textarea {...field} rows={3} bg="gray.50"/>} />
                            ) : (
                                <Controller control={control} name={`sections.${index}.zh.${f}`} render={({ field }) => <Input {...field} bg="gray.50"/>} />
                            )}
                        </Box>
                    )}
                </FormControl>
            ))}
             <FormControl gridColumn="1 / -1">
                <FormLabel fontSize="sm">Separator Color</FormLabel>
                <Controller
                    control={control}
                    name={`sections.${index}.separatorColor`}
                    render={({ field }) => (
                        <HStack>
                             <Input type="color" w="50px" p={1} value={field.value || '#0000ff'} onChange={field.onChange} />
                             <Input {...field} placeholder="Color hex/name" />
                        </HStack>
                    )}
                />
            </FormControl>
        </SimpleGrid>
    )
}

// 2. Education
const EducationEditor = ({ index, control, bilingual }: any) => {
    const { fields, append, remove, move } = useFieldArray({ control, name: `sections.${index}.educationExperience` })
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
    
    return (
        <VStack align="stretch" spacing={4}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
                const oldI = fields.findIndex(f => f.id === active.id)
                const newI = fields.findIndex(f => f.id === over?.id)
                if (oldI !== -1 && newI !== -1 && oldI !== newI) move(oldI, newI)
            }}>
                <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                    {fields.map((field, k) => (
                        <SortableItem key={field.id} id={field.id}>
                            <Flex justify="flex-end" position="absolute" top={2} right={2}><IconButton size="xs" aria-label="Delete" icon={<DeleteIcon />} onClick={() => remove(k)} colorScheme="red" variant="ghost"/></Flex>
                            <SimpleGrid columns={2} gap={3} mt={6}>
                                <Controller control={control} name={`sections.${index}.educationExperience.${k}.schoolName`} render={({ field }) => <Input {...field} placeholder="School Name" />} />
                                <Controller control={control} name={`sections.${index}.educationExperience.${k}.schoolLocation`} render={({ field }) => <Input {...field} placeholder="Location" />} />
                                <Controller control={control} name={`sections.${index}.educationExperience.${k}.degree`} render={({ field }) => <Input {...field} placeholder="Degree" />} />
                                <Controller control={control} name={`sections.${index}.educationExperience.${k}.major`} render={({ field }) => <Input {...field} placeholder="Major" />} />
                                <Controller control={control} name={`sections.${index}.educationExperience.${k}.startDate`} render={({ field }) => <Input {...field} type="date" placeholder="Start" />} />
                                <Controller control={control} name={`sections.${index}.educationExperience.${k}.endDate`} render={({ field }) => <Input {...field} type="date" placeholder="End" />} />
                                <Controller control={control} name={`sections.${index}.educationExperience.${k}.gpa`} render={({ field }) => <Input {...field} placeholder="GPA" />} />
                            </SimpleGrid>
                             {bilingual && (
                                <Box mt={3} p={3} bg="teal.50" borderRadius="md">
                                    <Text fontSize="xs" fontWeight="bold" color="teal.700" mb={2}>Bilingual Content (ZH)</Text>
                                    <SimpleGrid columns={2} gap={3}>
                                        <Controller control={control} name={`sections.${index}.zh.educationExperience.${k}.schoolName`} render={({ field }) => <Input {...field} size="sm" placeholder="School (ZH)" bg="white" />} />
                                        <Controller control={control} name={`sections.${index}.zh.educationExperience.${k}.degree`} render={({ field }) => <Input {...field} size="sm" placeholder="Degree (ZH)" bg="white" />} />
                                        <Controller control={control} name={`sections.${index}.zh.educationExperience.${k}.major`} render={({ field }) => <Input {...field} size="sm" placeholder="Major (ZH)" bg="white" />} />
                                    </SimpleGrid>
                                </Box>
                            )}
                        </SortableItem>
                    ))}
                </SortableContext>
            </DndContext>
            <Button size="sm" onClick={() => append({ schoolName: '', startDate: '', endDate: '' })} leftIcon={<AddIcon />}>Add Education</Button>
        </VStack>
    )
}

// 3. Skill & Languages
const SkillEditor = ({ index, control }: any) => {
    // Languages Array
    const { fields: langFields, append: appendLang, remove: removeLang, move: moveLang } = useFieldArray({ control, name: `sections.${index}.languages` })
    // Technical Array
    const { fields: techFields, append: appendTech, remove: removeTech, move: moveTech } = useFieldArray({ control, name: `sections.${index}.technical` })
    
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

    return (
        <VStack align="stretch" spacing={6}>
            <Box>
                <Heading size="xs" mb={2}>Languages</Heading>
                 <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
                        const o = langFields.findIndex(f => f.id === active.id); const n = langFields.findIndex(f => f.id === over?.id);
                        if (o!==n && o!==-1 && n!==-1) moveLang(o,n)
                  }}>
                    <SortableContext items={langFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                        {langFields.map((field, k) => (
                             <SortableItem key={field.id} id={field.id}>
                                <Flex justify="flex-end" position="absolute" top={1} right={1}><IconButton size="xs" aria-label="Delete" icon={<DeleteIcon />} onClick={() => removeLang(k)} colorScheme="red" variant="ghost"/></Flex>
                                <SimpleGrid columns={[1, 2]} gap={3} mt={4}>
                                    <Controller control={control} name={`sections.${index}.languages.${k}.language`} render={({ field }) => <Input {...field} placeholder="Language (e.g. Python)" />} />
                                    <Controller control={control} name={`sections.${index}.languages.${k}.level`} render={({ field }) => <Input {...field} placeholder="Level/Description" />} />
                                </SimpleGrid>
                             </SortableItem>
                        ))}
                    </SortableContext>
                </DndContext>
                <Button size="xs" onClick={() => appendLang({ language: '', level: '' })} leftIcon={<AddIcon />}>Add Language</Button>
            </Box>

            <Box>
                <Heading size="xs" mb={2}>Technical Skills</Heading>
                 <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
                        const o = techFields.findIndex(f => f.id === active.id); const n = techFields.findIndex(f => f.id === over?.id);
                        if (o!==n && o!==-1 && n!==-1) moveTech(o,n)
                  }}>
                    <SortableContext items={techFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                        {techFields.map((field, k) => (
                             <SortableItem key={field.id} id={field.id}>
                                <Flex justify="flex-end" position="absolute" top={1} right={1}><IconButton size="xs" aria-label="Delete" icon={<DeleteIcon />} onClick={() => removeTech(k)} colorScheme="red" variant="ghost"/></Flex>
                                <Input mb={2} {...control.register(`sections.${index}.technical.${k}.name`)} placeholder="Category Name" fontWeight="bold" />
                                {/* Description Array - handled as comma sep or lines for simplicity, or sub-array? 
                                    Looking at schema: description is string[] 
                                    Let's use a Textarea and split by newline for editing convenience
                                */}
                                <Controller
                                    control={control}
                                    name={`sections.${index}.technical.${k}.description`}
                                    render={({ field: { value, onChange } }) => (
                                        <Textarea 
                                            placeholder="Skills (one per line)" 
                                            value={Array.isArray(value) ? value.join('\n') : value} 
                                            onChange={(e) => onChange(e.target.value.split('\n'))} 
                                            rows={3}
                                        />
                                    )}
                                />
                             </SortableItem>
                        ))}
                    </SortableContext>
                </DndContext>
                <Button size="xs" onClick={() => appendTech({ name: '', description: [] })} leftIcon={<AddIcon />}>Add Technical Category</Button>
            </Box>
        </VStack>
    )
}

// 4. Project
const ProjectEditor = ({ index, control }: any) => {
    const { fields, append, remove, move } = useFieldArray({ control, name: `sections.${index}.projectExperience` })
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
    
    return (
        <VStack align="stretch" spacing={4}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
                const o = fields.findIndex(f => f.id === active.id); const n = fields.findIndex(f => f.id === over?.id);
                if (o!==n && o!==-1 && n!==-1) move(o,n)
            }}>
                <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                    {fields.map((field, k) => (
                        <SortableItem key={field.id} id={field.id}>
                            <Flex justify="flex-end" position="absolute" top={1} right={1}><IconButton size="xs" aria-label="Delete" icon={<DeleteIcon />} onClick={() => remove(k)} colorScheme="red" variant="ghost"/></Flex>
                            <SimpleGrid columns={2} gap={3} mt={6}>
                                <Controller control={control} name={`sections.${index}.projectExperience.${k}.title`} render={({ field }) => <Input {...field} placeholder="Project Title" />} />
                                <Controller control={control} name={`sections.${index}.projectExperience.${k}.projectLocation`} render={({ field }) => <Input {...field} placeholder="Location/URL" />} />
                                <Controller control={control} name={`sections.${index}.projectExperience.${k}.startDate`} render={({ field }) => <Input {...field} type="date" />} />
                                <Controller control={control} name={`sections.${index}.projectExperience.${k}.endDate`} render={({ field }) => <Input {...field} type="date" />} />
                                <Controller control={control} name={`sections.${index}.projectExperience.${k}.description`} render={({ field }) => <Textarea gridColumn="1 / -1" {...field} placeholder="Description" rows={2} />} />
                            </SimpleGrid>
                            {/* Features - simplified as textarea lines */}
                             <Accordion allowToggle mt={2}>
                                <AccordionItem border="none">
                                    <AccordionButton px={0}><Box flex="1" textAlign="left" fontSize="sm">Features / Bullets</Box><AccordionIcon /></AccordionButton>
                                    <AccordionPanel pb={4} px={0}>
                                        <Controller
                                            control={control}
                                            name={`sections.${index}.projectExperience.${k}.features`}
                                            render={({ field: { value = [], onChange } }) => (
                                                <VStack align="stretch">
                                                    {/* We map features[{description, furtherExplanation}] to simple lines for UI simplicity if possible, or build a mini-list editor? 
                                                        Schema says features: { description: string, furtherExplanation: string[] }[]
                                                        This is complex. Let's simplify editing to a Textarea where lines starting with "-" are furtherExplanation?
                                                        Or just use JSON text area for power users?
                                                        Let's just iterate them.
                                                    */}
                                                    {value.map((feat: any, fIdx: number) => (
                                                        <Box key={fIdx} pl={2} borderLeft="2px solid gray">
                                                            <Input 
                                                                size="sm" 
                                                                value={feat.description} 
                                                                onChange={(e) => {
                                                                    const nv = [...value]; nv[fIdx].description = e.target.value; onChange(nv)
                                                                }} 
                                                                placeholder="Feature" 
                                                                mb={1}
                                                            />
                                                            <Textarea 
                                                                size="sm" 
                                                                value={feat.furtherExplanation?.join('\n') || ''} 
                                                                onChange={(e) => {
                                                                    const nv = [...value]; nv[fIdx].furtherExplanation = e.target.value.split('\n'); onChange(nv)
                                                                }}
                                                                placeholder="Details (one per line)"
                                                                rows={2}
                                                            />
                                                            <Button size="xs" colorScheme="red" variant="link" onClick={() => {
                                                                onChange(value.filter((_:any, i:number) => i !== fIdx))
                                                            }}>Remove Feature</Button>
                                                        </Box>
                                                    ))}
                                                    <Button size="xs" onClick={() => onChange([...value, { description: '', furtherExplanation: [] }])}>Add Feature</Button>
                                                </VStack>
                                            )}
                                        />
                                    </AccordionPanel>
                                </AccordionItem>
                             </Accordion>
                        </SortableItem>
                    ))}
                </SortableContext>
            </DndContext>
            <Button size="sm" onClick={() => append({ title: '', startDate: '', endDate: '' })} leftIcon={<AddIcon />}>Add Project</Button>
        </VStack>
    )
}

// 5. Work Experience
const WorkExperienceEditor = ({ index, control }: any) => {
     const { fields, append, remove, move } = useFieldArray({ control, name: `sections.${index}.experiences` })
     const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
     
     return (
        <VStack align="stretch" spacing={4}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
                 const o = fields.findIndex(f => f.id === active.id); const n = fields.findIndex(f => f.id === over?.id);
                if (o!==n && o!==-1 && n!==-1) move(o,n)
            }}>
                <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                    {fields.map((field, k) => (
                        <SortableItem key={field.id} id={field.id}>
                             <Flex justify="flex-end" position="absolute" top={1} right={1}><IconButton size="xs" aria-label="Delete" icon={<DeleteIcon />} onClick={() => remove(k)} colorScheme="red" variant="ghost"/></Flex>
                            <SimpleGrid columns={2} gap={3} mt={6}>
                                <Controller control={control} name={`sections.${index}.experiences.${k}.companyName`} render={({ field }) => <Input {...field} placeholder="Company" fontWeight="bold"/>} />
                                <Controller control={control} name={`sections.${index}.experiences.${k}.jobTitle`} render={({ field }) => <Input {...field} placeholder="Job Title" />} />
                                <Controller control={control} name={`sections.${index}.experiences.${k}.startDate`} render={({ field }) => <Input {...field} type="date" />} />
                                <Controller control={control} name={`sections.${index}.experiences.${k}.endDate`} render={({ field }) => <Input {...field} type="date" />} />
                                <Controller control={control} name={`sections.${index}.experiences.${k}.location`} render={({ field }) => <Input {...field} placeholder="Location" />} />
                                <Controller control={control} name={`sections.${index}.experiences.${k}.jobDescription`} render={({ field }) => <Textarea {...field} placeholder="Summary" gridColumn="1/-1" rows={2}/>} />
                            </SimpleGrid>
                        </SortableItem>
                    ))}
                </SortableContext>
            </DndContext>
             <Button size="sm" onClick={() => append({ companyName: '', startDate: '', endDate: '' })} leftIcon={<AddIcon />}>Add Work Experience</Button>
        </VStack>
     )
}

// 6. Awards
const CompetitionEditor = ({ index, control }: any) => {
    const { fields, append, remove, move } = useFieldArray({ control, name: `sections.${index}.awards` })
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
    
    return (
       <VStack align="stretch" spacing={4}>
           <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
                const o = fields.findIndex(f => f.id === active.id); const n = fields.findIndex(f => f.id === over?.id);
               if (o!==n && o!==-1 && n!==-1) move(o,n)
           }}>
               <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                   {fields.map((field, k) => (
                       <SortableItem key={field.id} id={field.id}>
                            <Flex justify="flex-end" position="absolute" top={1} right={1}><IconButton size="xs" aria-label="Delete" icon={<DeleteIcon />} onClick={() => remove(k)} colorScheme="red" variant="ghost"/></Flex>
                           <SimpleGrid columns={2} gap={3} mt={6}>
                               <Controller control={control} name={`sections.${index}.awards.${k}.contestName`} render={({ field }) => <Input {...field} placeholder="Contest Name" fontWeight="bold"/>} />
                               <Controller control={control} name={`sections.${index}.awards.${k}.award`} render={({ field }) => <Input {...field} placeholder="Award/Rank" />} />
                               <Controller control={control} name={`sections.${index}.awards.${k}.date`} render={({ field }) => <Input {...field} type="date" />} />
                           </SimpleGrid>
                       </SortableItem>
                   ))}
               </SortableContext>
           </DndContext>
            <Button size="sm" onClick={() => append({ contestName: '', award: '' })} leftIcon={<AddIcon />}>Add Award</Button>
       </VStack>
    )
}

// 7. Extra Skills
const ExtraSkillEditor = ({ index, control }: any) => {
    // points: string[]
    // Use field array of objects { value: string }? No, RHF supports flat arrays but field array needs object.
    // Actually RHF useFieldArray supports flat array if we map it properly, but better to use object { text: string } and transform on submit?
    // Schema says points: string[]
    // Let's us Textarea for lines editing for simplicity "Standard" way for simple lists
    return (
        <FormControl>
            <FormLabel>Points (One per line)</FormLabel>
            <Controller
                control={control}
                name={`sections.${index}.points`}
                render={({ field: { value, onChange } }) => (
                    <Textarea 
                        value={Array.isArray(value) ? value.join('\n') : value} 
                        onChange={(e) => onChange(e.target.value.split('\n'))}
                        rows={6}
                    />
                )}
            />
        </FormControl>
    )
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function CVGuiEditorV2() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState<string[]>([])
  const [bilingual, setBilingual] = useState(false)
  
  // Database Config State
  const [showDbConfig, setShowDbConfig] = useState(false)
  const [dbConfig, setDbConfig] = useState({
    url: 'mongodb://localhost:27017',
    username: '',
    password: '',
    dbName: 'cv_database'
  })
  
  // Persist DB Config
  useEffect(() => {
     const loadConfig = async () => {
         try {
             // 1. Try to fetch from server first (persistent across devices/sessions)
             const res = await fetch('/api/mongo')
             const data = await res.json()
             if (data.ok && data.config) {
                 setDbConfig(data.config)
             } else {
                 // 2. Fallback to local storage (local draft)
                 const saved = localStorage.getItem('cv_mongo_config')
                 if (saved) {
                     try { setDbConfig(JSON.parse(saved)) } catch(e){}
                 }
             }
         } catch (e) {
             console.error('Failed to load DB config', e)
         }
     }
     loadConfig()
  }, [])

  useEffect(() => {
      // functional update or just simple dependency
      const timer = setTimeout(() => {
        localStorage.setItem('cv_mongo_config', JSON.stringify(dbConfig))
      }, 500)
      return () => clearTimeout(timer)
  }, [dbConfig])

  const saveConfigToServer = async (cfg: any) => {
      try {
          await fetch('/api/mongo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save_config', config: cfg })
          })
      } catch (e) {
         console.error('Failed to auto-save config to server', e)
      }
  }

  const [dbVerified, setDbVerified] = useState(false)
  const [dbTesting, setDbTesting] = useState(false)
  const [dbSnapshots, setDbSnapshots] = useState<any[]>([])

  const {
    control,
    handleSubmit
  } = useForm<{ sections: any[] }>({
    defaultValues: { sections: [] }
  })

  // We need to useFieldArray at top level to move sections
  const { fields: sections, move: moveSection, replace: replaceSections } = useFieldArray({
    control,
    name: 'sections',
  })

  // Load
  const loadData = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/cvdata')
      const data = await res.json()
      
      const en = Array.isArray(data.en) ? data.en : []
      const zh = Array.isArray(data.zh) ? data.zh : []

      // Merge:
      // We assume order matches. If lengths differ, we zip what we can.
      const merged = en.map((sect: any, i: number) => {
        // Find corresponding ZH section by sessionName if possible, or just index
        const zhSect = zh.find((z:any) => z.sessionName === sect.sessionName) || zh[i] || {}
        return {
           ...sect,
           zh: zhSect
        }
      })
      
      replaceSections(merged)
      listSnaps()
    } catch (e: any) {
      toast({ status: 'error', title: 'Load Failed', description: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // Save
  const onSubmit = async (data: { sections: any[] }, syncZh: boolean) => {
      try {
          // Split
          const en = data.sections.map(({ zh, ...rest }) => rest)
          
          let zh
          if (syncZh) {
               // Sync structure: map EN structure to ZH, reusing ZH values if they exist in the 'zh' prop
               zh = data.sections.map((sect) => ({
                   ...sect.zh, // Keep existing ZH content
                   sessionName: sect.sessionName, 
                   headerName: sect.zh?.headerName || sect.headerName // Fallback to EN header if missing
               }))
          } else {
               // If not syncing structure, what do we do? 
               // Standard logic in this project seems to be: save both lists. 
               // The 'zh' prop in form holds the ZH data for that section.
               zh = data.sections.map(s => s.zh || { sessionName: s.sessionName, headerName: s.headerName })
          }

          const res = await fetch('/api/cvdata', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ en, zh, syncZh }),
          })
          
          if (!res.ok) throw new Error('Failed to save')
          toast({ status: 'success', title: 'Saved!' })
      } catch (e: any) {
          toast({ status: 'error', title: 'Save error', description: e.message })
      }
  }

  // Snapshots
  const listSnaps = async () => {
    const res = await fetch('/api/cvdata?snapshots=1').catch(()=>null)
    if (res?.ok) {
        const d = await res.json()
        setSnapshots(d.files || [])
    }
  }
  const makeSnapshot = async () => {
     await fetch('/api/cvdata', { method: 'POST', body: JSON.stringify({ action: 'snapshot' }) })
     toast({ status: 'success', title: 'Snapshot created' })
     listSnaps()
  }
  const restoreSnapshot = async (filename: string) => {
      if(!filename) return
      if(!confirm(`Restore ${filename}?`)) return
      const res = await fetch('/api/cvdata', { method: 'POST', body: JSON.stringify({ action: 'restore', filename }) })
      if(res.ok) {
          toast({ status: 'success', title: 'Restored' })
          loadData()
      }
  }

  // Database Helpers
  const constructConnectionUrl = () => {
    // Basic logic: if user/pass provided, inject into URL if not present
    // But mongo urls are complex. Let's assume user provides full string OR host.
    // If usage of user/pass fields is detecting, try to inject.
    // Actually, safest is to pass config object to API and let it handle connection options? No, node driver takes URI.
    // Let's keep it simple: We pass the config object as is, and the API constructs the connection.
    // Wait, my previous API code just took `url` from config. I should update API to handle user/pass or update logic here.
    
    // Let's update frontend logic to build the URI before sending if user/pass are separate.
    let uri = dbConfig.url
    if (dbConfig.username && dbConfig.password && !uri.includes('@')) {
       // Naive injection for standard protocols
       const protocolSplit = uri.split('://')
       if (protocolSplit.length === 2) {
           uri = `${protocolSplit[0]}://${encodeURIComponent(dbConfig.username)}:${encodeURIComponent(dbConfig.password)}@${protocolSplit[1]}`
       }
    }
    return uri
  }

  const listDbSnapshots = async () => {
      try {
          // ensure verified or at least have a url? 
          if (!dbVerified && !confirm('DB not verified. Try to list anyway?')) return

          const uri = constructConnectionUrl()
          const res = await fetch('/api/mongo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'list', 
                config: { ...dbConfig, url: uri } 
            })
          })
          const data = await res.json()
          if (res.ok && data.ok) {
              setDbSnapshots(data.snapshots || [])
          } else {
              setDbSnapshots([])
              toast({ status: 'error', title: 'Failed to list snapshots', description: data.message })
          }
      } catch (e: any) {
          toast({ status: 'error', title: 'List Error', description: e.message })
      }
  }

  const loadDbSnapshot = async (id: string) => {
      try {
          if (!confirm('Load this snapshot? Current unsaved changes will be lost.')) return

          setLoading(true)
          const uri = constructConnectionUrl()
          const res = await fetch('/api/mongo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'load', 
                config: { ...dbConfig, url: uri },
                data: { id }
            })
          })
          const result = await res.json()
          
          if (res.ok && result.ok && result.data) {
              // Same logic as loadData for existing structure
              // The DB saves { en: ..., zh: ... }
              const { en, zh } = result.data
              const merged = (Array.isArray(en) ? en : []).map((sect: any, i: number) => {
                const zhSect = (Array.isArray(zh) ? zh : []).find((z:any) => z.sessionName === sect.sessionName) || (Array.isArray(zh) ? zh[i] : {})
                return { ...sect, zh: zhSect }
              })
              
              replaceSections(merged)
              toast({ status: 'success', title: 'Snapshot Loaded', description: 'Database snapshot restored successfully.' })
          } else {
              throw new Error(result.message || 'Failed to load data')
          }
      } catch (e: any) {
          toast({ status: 'error', title: 'Load Error', description: e.message })
      } finally {
          setLoading(false)
      }
  }

  const testDbConnection = async () => {
      setDbTesting(true)
      try {
          const uri = constructConnectionUrl()
          const res = await fetch('/api/mongo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  action: 'test', 
                  config: { ...dbConfig, url: uri } 
              })
          })
          const data = await res.json()
          if (res.ok && data.ok) {
              setDbVerified(true)
              toast({ status: 'success', title: 'Connection Verified', description: 'Database is reachable.' })
              saveConfigToServer(dbConfig) // Persist working config to server
              listDbSnapshots() // Auto-fetch snapshots
          } else {
              setDbVerified(false)
              throw new Error(data.message || 'Connection failed')
          }
      } catch (e: any) {
          setDbVerified(false)
          toast({ status: 'error', title: 'Connection Failed', description: e.message })
      } finally {
          setDbTesting(false)
      }
  }

  const saveToDb = async (formData: { sections: any[] }) => {
      if (!dbVerified) {
          toast({ status: 'warning', title: 'Not Verified', description: 'Please test database connection first.' })
          return
      }
      
      try {
           // Reuse existing sync logic to prepare data structure (saving both EN and ZH)
           // We'll mimic the 'save + sync struct' format for DB backup as it's the most complete
           const en = formData.sections.map(({ zh, ...rest }) => rest)
           const zh = formData.sections.map((sect) => ({
                ...sect.zh, 
                sessionName: sect.sessionName, 
                headerName: sect.zh?.headerName || sect.headerName 
            }))

           const fullData = { en, zh }
           const uri = constructConnectionUrl()
           
           const res = await fetch('/api/mongo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  action: 'save', 
                  config: { ...dbConfig, url: uri },
                  data: { data: fullData, note: 'Saved from GUI V2' }
              })
           })
           
           if (!res.ok) throw new Error('Failed to save to DB')
           toast({ status: 'success', title: 'Saved to Database!' })
           listDbSnapshots() // Refresh list
      } catch (e: any) {
           toast({ status: 'error', title: 'DB Save Error', description: e.message })
      }
  }

  // Sensors for Top Level
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  return (
    <Box pb={20}>
      <Flex direction="column" gap={4} mb={6} position="sticky" top={0} bg="white" zIndex={100} p={4} borderBottom="1px solid" borderColor="gray.200" boxShadow="sm">
         <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
             <HStack>
                <Button colorScheme="blue" onClick={handleSubmit((d) => onSubmit(d, false))} isLoading={loading}>Save File</Button>
                {/* <Button colorScheme="teal" onClick={handleSubmit((d) => onSubmit(d, true))} isLoading={loading}>Save + Sync Struct</Button> */}
                <Button variant="outline" onClick={loadData}>Reload</Button>
                <Button colorScheme="purple" onClick={() => setShowDbConfig(!showDbConfig)}>
                    {showDbConfig ? 'Hide DB Config' : 'Database Settings'}
                </Button>
                {/* Save to DB Button - Only enabled if verified */}
                <Button 
                    colorScheme="green" 
                    isDisabled={!dbVerified} 
                    onClick={handleSubmit((d) => saveToDb(d))}
                    leftIcon={<Box as="span" fontSize="lg">💾</Box>}
                >
                    Save to DB
                </Button>
             </HStack>
             
             <FormControl display="flex" alignItems="center" w="auto">
                 <FormLabel htmlFor="bilingual-mode" mb="0" mr={2}>Bilingual Editing</FormLabel>
                 <Switch id="bilingual-mode" isChecked={bilingual} onChange={(e) => setBilingual(e.target.checked)} />
             </FormControl>
         </Flex>
         
         {/* Database Configuration Panel */}
         {showDbConfig && (
            <Box p={4} bg="gray.50" borderRadius="md" border="1px solid" borderColor="purple.200">
                <SimpleGrid columns={[1, 2, 4]} gap={4} mb={4}>
                    <FormControl>
                        <FormLabel fontSize="xs">Connection URL (Host/URI)</FormLabel>
                        <Input 
                            size="sm" 
                            bg="white" 
                            value={dbConfig.url} 
                            onChange={(e) => {
                                setDbConfig({...dbConfig, url: e.target.value})
                                setDbVerified(false)
                            }} 
                            placeholder="mongodb://localhost:27017"
                        />
                    </FormControl>
                    <FormControl>
                        <FormLabel fontSize="xs">Username (Optional)</FormLabel>
                        <Input 
                            size="sm" 
                            bg="white" 
                            value={dbConfig.username} 
                            onChange={(e) => {
                                setDbConfig({...dbConfig, username: e.target.value})
                                setDbVerified(false)
                            }} 
                        />
                    </FormControl>
                    <FormControl>
                        <FormLabel fontSize="xs">Password (Optional)</FormLabel>
                        <Input 
                            size="sm" 
                            type="password" 
                            bg="white" 
                            value={dbConfig.password} 
                            onChange={(e) => {
                                setDbConfig({...dbConfig, password: e.target.value})
                                setDbVerified(false)
                            }} 
                        />
                    </FormControl>
                    <FormControl>
                        <FormLabel fontSize="xs">Database Name</FormLabel>
                        <Input 
                            size="sm" 
                            bg="white" 
                            value={dbConfig.dbName} 
                            onChange={(e) => setDbConfig({...dbConfig, dbName: e.target.value})} 
                        />
                    </FormControl>
                </SimpleGrid>
                <HStack>
                    <Button 
                        size="sm" 
                        colorScheme={dbVerified ? 'green' : 'gray'} 
                        onClick={testDbConnection} 
                        isLoading={dbTesting}
                    >
                        {dbVerified ? 'Verified ✓' : 'Test Connection'}
                    </Button>
                    <Text fontSize="xs" color="gray.500">
                        {dbVerified ? 'Connection established. You can now save to database.' : 'Please test connection before saving.'}
                    </Text>
                </HStack>

                {dbVerified && (
                    <Box mt={4} pt={4} borderTop="1px solid" borderColor="gray.200">
                        <Flex justify="space-between" align="center" mb={2}>
                             <Text fontSize="xs" fontWeight="bold">Database Snapshots</Text>
                             <Button size="xs" onClick={listDbSnapshots}>Refresh List</Button>
                        </Flex>
                        {dbSnapshots.length === 0 ? (
                            <Text fontSize="xs" color="gray.500" fontStyle="italic">No snapshots fetched.</Text>
                        ) : (
                            <SimpleGrid columns={[1, 2, 3]} gap={2} maxHeight="200px" overflowY="auto">
                                {dbSnapshots.map((snap: any) => (
                                    <Box key={snap._id} p={2} bg="white" borderRadius="sm" border="1px solid" borderColor="gray.100" _hover={{ borderColor: 'blue.300', bg: 'blue.50' }} cursor="pointer" onClick={() => loadDbSnapshot(snap._id)}>
                                        <Text fontSize="xs" fontWeight="bold">{snap.source || 'Unknown'}</Text>
                                        <Text fontSize="xs">{snap.note}</Text>
                                        <Text fontSize="xs" color="gray.500">{new Date(snap.timestamp).toLocaleString()}</Text>
                                    </Box>
                                ))}
                            </SimpleGrid>
                        )}
                    </Box>
                )}
            </Box>
         )}
         
         <HStack>
             <Button size="xs" onClick={makeSnapshot}>Local Snapshot</Button>
             <Select size="xs" w="200px" placeholder="Restore Local..." onChange={(e) => restoreSnapshot(e.target.value)}>
                 {snapshots.map(s => <option key={s} value={s}>{s}</option>)}
             </Select>
         </HStack>
      </Flex>

      {loading ? (
          <Text p={8} textAlign="center">Loading Editor...</Text>
      ) : (
          <>
          {/* Structure Overview (Unified with JSON Editor) */}
          <StructureOverview control={control} fields={sections} move={moveSection} /> 

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
                const o = sections.findIndex(f => f.id === active.id); const n = sections.findIndex(f => f.id === over?.id);
                if (o!==n && o!==-1 && n!==-1) moveSection(o,n)
          }}>
              <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  {sections.map((field, index) => (
                      <SectionEditor 
                        key={field.id} 
                        section={field} 
                        index={index} 
                        control={control} 
                        bilingual={bilingual} 
                      />
                  ))}
              </SortableContext>
          </DndContext>
          </>
      )}
    </Box>
  )
}
