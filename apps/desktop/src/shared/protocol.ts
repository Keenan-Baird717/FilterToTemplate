import type { UIMessage, UIMessageChunk } from 'ai'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Fill state: the app-owned system of record that agent tools and the UI share.
// ---------------------------------------------------------------------------

export type FieldStatus =
  | 'empty'
  | 'verified'
  | 'conflict'
  | 'missing'
  | 'drafting'
  | 'user_answered'
  | 'approved'

export interface SourceRef {
  docId: string
  page?: number
  /** Non-paged locator such as a sheet range or email part. */
  locator?: string
  quote: string
}

export type FieldValue = string | number | boolean | null

export interface Candidate {
  value: FieldValue
  display: string
  sources: SourceRef[]
}

export interface FieldState {
  value: FieldValue
  display?: string
  status: FieldStatus
  sources: SourceRef[]
  candidates?: Candidate[]
  note?: string
  by?: 'agent' | 'user'
}

export interface RateRow {
  key: string
  role: string
  rate: number
  source?: SourceRef
}

export interface RatesState {
  rows: RateRow[]
  status: FieldStatus
}

export type FillOp =
  | { op: 'reset' }
  | { op: 'set'; fieldId: string; field: FieldState }
  | { op: 'rates'; rates: RatesState }
  | { op: 'activity'; label: string | null }

// ---------------------------------------------------------------------------
// Follow-up questions (rendered as a batched form in the chat).
// ---------------------------------------------------------------------------

export interface QuestionOption {
  value: string
  display: string
  sources: SourceRef[]
}

export interface QuestionItem {
  fieldId: string
  label: string
  help?: string
  kind: 'choice' | 'text'
  inputType?: 'email' | 'text'
  placeholder?: string
  options?: QuestionOption[]
}

export interface QuestionSet {
  id: string
  title: string
  reason: string
  items: QuestionItem[]
}

export interface AnswerPayload {
  questionId: string
  answers: Record<string, string>
}

// ---------------------------------------------------------------------------
// Chat messages, typed for the AI SDK's useChat.
// ---------------------------------------------------------------------------

export type AppDataParts = {
  fill: FillOp
  question: QuestionSet
}

export interface AppMessageMetadata {
  answer?: AnswerPayload
  command?: 'run-fill'
}

export type AppUIMessage = UIMessage<AppMessageMetadata, AppDataParts>
export type AppChunk = UIMessageChunk<AppMessageMetadata, AppDataParts>

// ---------------------------------------------------------------------------
// Renderer <-> agent worker contract, carried over a MessagePort.
// ---------------------------------------------------------------------------

export const toWorkerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send'),
    streamId: z.string(),
    messages: z.array(z.custom<AppUIMessage>((m) => typeof m === 'object' && m !== null))
  }),
  z.object({ type: z.literal('abort'), streamId: z.string() })
])

export type ToWorker = z.infer<typeof toWorkerSchema>

export type FromWorker =
  | { type: 'ready'; engine: string }
  | { type: 'chunk'; streamId: string; chunk: AppChunk }
  | { type: 'end'; streamId: string }
