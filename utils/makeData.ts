// import namor from '@ggascoigne/namor'
import namor from 'namor'
const { v4: uuid } = require('uuid')
const { DateTime } = require('luxon')

// export type BinderRecord = {
//   binderID: string
//   title: string
//   type: string
//   destination: string
// timeFrom: string
// timeTo: string
// }

export interface BinderRecord {
  binderID: string
  destinations: [
    {
      title: string
      type: string
      target: string
      timeFrom: string
      timeTo: string
    }
  ]
}

export const initialBinderRecord: BinderRecord = {
  binderID: '',
  destinations: [
    {
      title: '',
      type: '',
      target: '',
      timeFrom: '',
      timeTo: '',
    },
  ],
}

export interface EventRecord {
  id: string
  event_startTime: string
  event_endTime: string
  subject_code: string
  subject_name: string
  event_code: string
  event_status: number
  // event_active: boolean
}

export const initialEventRecord: EventRecord = {
  id: '',
  event_startTime: '',
  event_endTime: '',
  subject_code: '',
  subject_name: '',
  event_code: '',
  event_status: -1,
}

export interface ExamPaperRecord {
  id: string
  exam_seat_no: number
  exam_paper_id: string
  exam_status: number
  exam_score: string
}

export const initialExamPaperRecord: ExamPaperRecord = {
  id: '',
  exam_seat_no: 1,
  exam_paper_id: '',
  exam_status: -1,
  exam_score: '',
}

const range = (len: number) => {
  const arr = []
  for (let i = 0; i < len; i++) {
    arr.push(i)
  }
  return arr
}

const newBinderData = (): BinderRecord => {
  let endTime = DateTime.local(
    Math.floor(Math.random() * 100) + 2022,
    Math.floor(Math.random() * 12) + 1,
    Math.floor(Math.random() * 30) + 1,
    Math.floor(Math.random() * 23),
    30
  ).toISO()
  return {
    binderID: uuid(),
    destinations: [
      {
        title: namor.generate({ words: 1, saltLength: 0 }),
        type: namor.generate({ words: 1, saltLength: 0 }),
        target: 'https://www.instagram.com/regina.ip/',
        timeFrom: new Date().toISOString(),
        timeTo: endTime,
      },
    ],
  }
}

const newEventData = (): EventRecord => {
  //   const statusChance = Math.random()
  let startTime = DateTime.local(
    2022,
    Math.floor(Math.random() * 12) + 1,
    Math.floor(Math.random() * 30) + 1,
    Math.floor(Math.random() * 23),
    30
  ).toISO()
  let t = uuid()

  return {
    id: uuid(),
    event_startTime: startTime,
    event_endTime: DateTime.fromISO(startTime).plus({ hours: 2 }).toISO(),
    subject_code: namor.generate({ words: 1, saltLength: 0 }),
    subject_name: namor.generate({ words: 1, saltLength: 0 }),
    event_code: t.substring(t.indexOf('-'), -1),
    event_status: Math.floor(Math.random() * 4),
    // event_active: Math.floor(Math.random() * 2) == 0 ? true : false,
  }
}

const newExamPaperData = (): ExamPaperRecord => {
  return {
    id: uuid(),
    exam_seat_no: 1,
    exam_paper_id: uuid(),
    exam_status: Math.floor(Math.random() * 3),
    exam_score: Math.floor(Math.random() * 11).toString(),
  }
}

export type BinderData = BinderRecord & {
  subRows?: BinderData[]
}

export type EventData = EventRecord & {
  subRows?: EventData[]
}

export type ExamPaperData = ExamPaperRecord & {
  subRows?: ExamPaperData[]
}

export function makeBinderData(...lens: number[]): BinderData[] {
  const makeDataLevel = (depth = 0): BinderData[] => {
    const len = lens[depth]
    return range(len).map(() => ({
      ...newBinderData(),
      // subRows: lens[depth + 1] ? makeDataLevel(depth + 1) : undefined,
    }))
  }

  return makeDataLevel()
}

export function makeEventData(...lens: number[]): EventData[] {
  const makeDataLevel = (depth = 0): EventData[] => {
    const len = lens[depth]
    return range(len).map(() => ({
      ...newEventData(),
      // subRows: lens[depth + 1] ? makeDataLevel(depth + 1) : undefined,
    }))
  }

  return makeDataLevel()
}

export function makeExamPaperData(...lens: number[]): ExamPaperData[] {
  const makeDataLevel = (depth = 0): ExamPaperData[] => {
    const len = lens[depth]
    return range(len).map(() => ({
      ...newExamPaperData(),
      // subRows: lens[depth + 1] ? makeDataLevel(depth + 1) : undefined,
    }))
  }

  return makeDataLevel()
}
