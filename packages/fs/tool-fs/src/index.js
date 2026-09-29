import z from '@freddie/schemastery'
import { applyReadTool, READ_LIMIT, STREAM_MIN_SIZE } from './read.js'
import { applyWriteTool } from './write.js'
import { applyEditTool } from './edit.js'
import { applyReadImageTool } from './read-image.js'
import { READ_MAX_BYTES, READ_MAX_LINE_LENGTH } from './read-render.js'
import { FsSandboxController } from './sandbox.js'

export const name = 'tool-fs'

export const inject = ['tools', 'fs', 'systemPrompt']

export const Config = z.object({
  readLimit: z.number().default(READ_LIMIT),
  readMaxLineLength: z.number().default(READ_MAX_LINE_LENGTH),
  readMaxBytes: z.number().default(READ_MAX_BYTES),
  readStreamMinSize: z.number().default(STREAM_MIN_SIZE),
})

function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`tool-fs: ${name} must be a positive integer`)
  }
}

export function apply(ctx, config) {
  const resolved = config
  assertPositiveInteger('readLimit', resolved.readLimit)
  assertPositiveInteger('readMaxLineLength', resolved.readMaxLineLength)
  assertPositiveInteger('readMaxBytes', resolved.readMaxBytes)
  assertPositiveInteger('readStreamMinSize', resolved.readStreamMinSize)
  applyReadTool(ctx, {
    limit: resolved.readLimit,
    maxLineLength: resolved.readMaxLineLength,
    maxBytes: resolved.readMaxBytes,
    streamMinSize: resolved.readStreamMinSize,
  })
  ctx.inject(['attachments'], (imageCtx) => {
    applyReadImageTool(imageCtx)
  })
  const sandbox = new FsSandboxController(ctx)
  applyWriteTool(ctx, sandbox)
  applyEditTool(ctx, sandbox)
}
