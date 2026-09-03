import { loadDocument } from './lib/doc-loader.js'
import { classify, extract, discover } from './lib/agents.js'
import { learn } from './lib/learner.js'
import { readLessons, listLessonTypes } from './lib/lessons-store.js'
import { withFreshLessons } from './lib/staleness.js'
import { routeByConfidence } from './lib/routing.js'

const ACTIONS = {
    classify: async (args) => {
        const doc = await loadDocument(args.document)
        if (doc.error) return { error: doc.error }
        const known = await listLessonTypes(args.cwd)
        return await classify(doc.text, known, { model: args.model })
    },

    extract: async (args) => {
        const doc = await loadDocument(args.document)
        if (doc.error) return { error: doc.error }
        const lessons = readLessons(args.documentType, args.cwd) || ''
        return await extract(doc.text, lessons, args.schema || {}, { model: args.model })
    },

    discover: async (args) => {
        const doc = await loadDocument(args.document)
        if (doc.error) return { error: doc.error }
        return await discover(doc.text, args.desiredFields || [], { model: args.model })
    },

    learn: async (args) => {
        if (!args.documentType) return { error: 'documentType required' }
        return await learn(args.documentType, args.corrections || [], { cwd: args.cwd, model: args.model })
    },

    full_pipeline: async (args) => {
        const doc = await loadDocument(args.document)
        if (doc.error) return { error: doc.error }

        const known = await listLessonTypes(args.cwd)
        const cls = await classify(doc.text, known, { model: args.model })
        if (cls.rejected) return { error: cls.reason }

        let documentType = cls.documentType
        if (!documentType || documentType === 'NEW' || cls.confidence < 0.5) {
            const disc = await discover(doc.text, args.desiredFields || Object.keys(args.schema || {}), { model: args.model })
            documentType = disc.documentType
            if (disc.rejected) return { error: disc.reason || 'discovery failed', documentType }
        }

        const ext = await withFreshLessons(documentType, doc.contentHash, { cwd: args.cwd }, (lessons) =>
            extract(doc.text, lessons, args.schema || {}, { model: args.model }))
        if (ext.status === 'stale') return { status: 'stale', skipped: true, documentType }
        if (ext.rejected) return { error: ext.reason, documentType }

        const routed = routeByConfidence(ext.rows, ext.confidence)
        return { documentType, classification: cls, ...routed, extractorReason: ext.extractorReason }
    },
}

export const _tool = ({
    name: 'document_extract',
    toolset: 'core',
    schema: {
        name: 'document_extract',
        description: 'Extract structured data from adversarially-formatted documents (text, HTML, URLs, files, or images) using cheap-model classification plus git-tracked plaintext lessons files that improve over corrections. PDF-native text extraction is not supported -- route PDFs through document.type="image" (vision path) since this subsystem deliberately avoids a PDF-parser dependency. Actions: classify (identify document type), extract (pull structured rows using known lessons), discover (propose a new lessons template for an unknown type), learn (absorb human corrections into a lessons file), full_pipeline (classify -> discover-if-new -> stale-check -> extract -> confidence-route, in one call).',
        parameters: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: Object.keys(ACTIONS) },
                document: { type: 'object', description: '{type: "text"|"html"|"url"|"file"|"image", content|url|filePath: string}' },
                documentType: { type: 'string' },
                schema: { type: 'object', description: 'flat field:type map, e.g. {"region":"string","q1_sales":"float"}' },
                desiredFields: { type: 'array', items: { type: 'string' } },
                corrections: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, before: {}, after: {}, reason: { type: 'string' } } } },
                model: { type: 'string' },
                cwd: { type: 'string' },
            },
            required: ['action'],
        },
    },
    handler: async (args) => {
        const fn = ACTIONS[args.action]
        if (!fn) return { error: 'unknown action: ' + args.action }
        return await fn(args)
    },
})
