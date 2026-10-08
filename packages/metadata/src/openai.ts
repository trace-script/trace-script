import { z } from 'zod'
import { jsonValueSchema } from './protocol'

// A documented observability subset of Responses, not an API request validator.
export const responseContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('input_text'), text: z.string() }).catchall(jsonValueSchema),
  z.object({ type: z.literal('output_text'), text: z.string() }).catchall(jsonValueSchema),
  z.object({ type: z.literal('refusal'), refusal: z.string() }).catchall(jsonValueSchema),
  z.object({ type: z.literal('input_image'), image_url: z.string().optional(), file_id: z.string().optional(), detail: z.enum(['auto', 'low', 'high', 'original']).optional() }).catchall(jsonValueSchema),
  z.object({ type: z.literal('input_file'), file_id: z.string().optional(), filename: z.string().optional(), file_data: z.string().optional(), file_url: z.string().optional() }).catchall(jsonValueSchema),
])
export const responseItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), id: z.string().optional(), role: z.enum(['system', 'developer', 'user', 'assistant']), content: z.union([z.string(), z.array(responseContentSchema)]), status: z.string().optional() }).catchall(jsonValueSchema),
  z.object({ type: z.literal('function_call'), id: z.string().optional(), call_id: z.string(), name: z.string(), arguments: z.string(), status: z.string().optional() }).catchall(jsonValueSchema),
  z.object({ type: z.literal('function_call_output'), id: z.string().optional(), call_id: z.string(), output: z.union([z.string(), z.array(responseContentSchema)]) }).catchall(jsonValueSchema),
])
export const responseUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  input_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative() }).catchall(jsonValueSchema).optional(),
  output_tokens_details: z.object({ reasoning_tokens: z.number().int().nonnegative() }).catchall(jsonValueSchema).optional(),
}).catchall(jsonValueSchema)
export const responseRequestSchema = z.object({
  model: z.string().min(1),
  input: z.union([z.string(), z.array(z.union([
    responseItemSchema,
    z.object({ role: z.enum(['system', 'developer', 'user', 'assistant']), content: z.union([z.string(), z.array(responseContentSchema)]) }).catchall(jsonValueSchema),
    z.object({ type: z.string() }).catchall(jsonValueSchema),
  ]))]).optional(),
  instructions: z.string().optional(),
  stream: z.boolean().optional(),
}).catchall(jsonValueSchema)
export type ResponseItem = z.infer<typeof responseItemSchema>
export type ResponseRequest = z.infer<typeof responseRequestSchema>
export type ResponseUsage = z.infer<typeof responseUsageSchema>
