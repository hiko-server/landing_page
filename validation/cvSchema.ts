import { z } from 'zod'

const optionalString = z.string().optional().or(z.literal(''))

export const PersonalInfoSchema = z.object({
  sessionName: z.literal('personalInformation'),
  headerName: z.string().min(1, 'Header name is required'),
  isVisible: z.boolean().optional(),
  firstName: z.string(),
  lastName: z.string(),
  nickName: z.string(),
  email: z.string().email().or(z.literal('')),
  phoneNumber: z.string(),
  personalWebsite: z.string(),
  address: z.string(),
  introduction: z.string(),
  hiddenFields: z.array(z.string()).optional(),
  separatorColor: z.string().optional(),
})

export const EducationSchema = z.object({
  sessionName: z.literal('education'),
  headerName: z.string().min(1, 'Header name is required'),
  isVisible: z.boolean().optional(),
  educationExperience: z.array(
    z.object({
      schoolName: z.string().min(1, 'School name is required'),
      schoolLocation: z.string(),
      degree: z.string(),
      major: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      gpa: optionalString,
    })
  ),
})

export const SkillSchema = z.object({
  sessionName: z.literal('skill'),
  headerName: z.string().min(1, 'Header name is required'),
  isVisible: z.boolean().optional(),
  languages: z.array(
    z.object({
      language: z.string().min(1, 'Name required'),
      level: z.string(),
    })
  ),
  technical: z.array(
    z.object({
      name: z.string().min(1, 'Name required'),
      description: z.array(z.string()),
    })
  ),
})

export const ProjectSchema = z.object({
  sessionName: z.literal('project'),
  headerName: z.string().min(1, 'Header name is required'),
  isVisible: z.boolean().optional(),
  projectExperience: z.array(
    z.object({
      title: z.string().min(1, 'Title required'),
      startDate: z.string(),
      endDate: z.string(),
      projectLocation: z.string(),
      description: z.string(),
      features: z.array(
        z.object({
          description: z.string(),
          furtherExplanation: z.array(z.string()),
        })
      ),
    })
  ),
})

export const WorkSchema = z.object({
  sessionName: z.literal('workExperience'),
  headerName: z.string().min(1, 'Header name is required'),
  isVisible: z.boolean().optional(),
  experiences: z.array(
    z.object({
      companyName: z.string().min(1, 'Company name required'),
      companyURL: optionalString,
      jobTitle: z.string(),
      jobDescription: z.string(),
      location: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      relatedSkills: z.array(z.string()),
      features: z.array(
        z.object({
          description: z.string(),
          furtherExplanation: z.array(z.string()),
        })
      ),
    })
  ),
})

export const CompetitionSchema = z.object({
  sessionName: z.literal('competitionAwards'),
  headerName: z.string().min(1, 'Header name is required'),
  isVisible: z.boolean().optional(),
  awards: z.array(
    z.object({
      contestName: z.string().min(1, 'Contest name required'),
      award: z.string(),
      organization: optionalString,
      date: z.string(),
      location: optionalString,
      description: z.array(z.string()),
    })
  ),
})

export const ExtraSkillSchema = z.object({
  sessionName: z.literal('extraSkill'),
  headerName: z.string().min(1, 'Header name is required'),
  isVisible: z.boolean().optional(),
  points: z.array(z.string()),
})

// Union of all section types
export const CVSectionSchema = z.union([
  PersonalInfoSchema,
  EducationSchema,
  SkillSchema,
  ProjectSchema,
  WorkSchema,
  CompetitionSchema,
  ExtraSkillSchema,
  // Fallback for unknown sections if any
  z.object({
    sessionName: z.string(),
    headerName: z.string(),
    isVisible: z.boolean().optional(),
  }).passthrough(),
])

// The root schema is an array of sections
export const CVSchema = z.array(CVSectionSchema)

export type ICVData = z.infer<typeof CVSchema>
