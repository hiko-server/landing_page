export type CVData =(PersonalInformation | Education | Skill | Project | ExtraSkill | Certification)[];
// export type CVData =(PersonalInformation )[];
// export type CVData =( Education )[];
// export type CVData =( Skill )[];
// export type CVData =( Project)[];
// export type CVData =( ExtraSkill)[];


export interface CVSection {
  sessionName: string
  headerName: string
}

export interface Certification extends CVSection{
  certifications: CertificationList[]
}
export interface CertificationList{
  certificationName: string
  issuingOrganization: string
  organizationURL:string
  issuedDate: string
  expirationDate: string
  credentialID: string
  credentialURL: string
}

export interface PersonalInformation{
  sessionName: string
  headerName: string
  firstName: string
  lastName: string
  nickName: string
  email: string
  phoneNumber: string
  personalWebsite:string
  address: string
  introduction: string
}

export interface Education extends CVSection{
  educationExperience: EducationExperience[]
}

export interface EducationExperience{
  schoolName: string
  schoolLocation: string
  degree: string
  major: string
  startDate: string
  endDate: string
  gpa?: string
}

export interface Skill  extends CVSection{
  languages: Language[]
  technical: Technical[]
}

export interface Language {
  language: string
  level: string
}

export interface Technical {
  name: string
  description: string[]
}

export interface Project  extends CVSection{
  projectExperience: ProjectExperience[]
}

export interface ProjectExperience {
  title: string
  startDate: string
  endDate: string
  projectLocation:string
  description: string
  features: Feature[]
}

export interface Feature {
  description: string
  furtherExplanation: string[]
}

export interface ExtraSkill  extends CVSection{
  points: string[]
}

export const defaultCVData: CVData = [
  {
    sessionName: "",
    headerName: "",
    firstName: "",
    lastName: "",
    nickName: "",
    email: "",
    phoneNumber: "",
    personalWebsite: "",
    address: "",
    introduction: ""
  },
  {
    sessionName: "",
    headerName: "",
    educationExperience: []
  },
  {
    sessionName: "",
    headerName: "",
    languages: [],
    technical: []
  },
  {
    sessionName: "",
    headerName: "",
    projectExperience: []
  },
  {
    sessionName:"",
    headerName: "",
    points:[]
}
];