
import { Context, Service } from '@freddie/cordis'

export const RESERVED_BINDING_GLOBALS = new Set([
  'console',
  '__dsh_main__', '__builtins__', '__name__', '__debug__',
])

export const RESERVED_ERROR_MEMBERS = new Set([
  'name', 'message', 'stack',
  'args', 'with_traceback', 'add_note',
])

export const DUNDER_MEMBER = /^__.+__$/

const ECMASCRIPT_RESERVED_AND_STRICT_MODE_WORDS = [
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
  'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'implements', 'interface', 'package',
  'private', 'protected', 'public', 'arguments', 'eval',
]

const PYTHON_KEYWORDS_AND_SOFT_KEYWORDS_BEYOND_ECMASCRIPT = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'def', 'del', 'elif', 'except', 'from',
  'global', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'match', 'type', '_',
]

export const PORTABLE_RESERVED_WORDS = new Set([
  ...ECMASCRIPT_RESERVED_AND_STRICT_MODE_WORDS,
  ...PYTHON_KEYWORDS_AND_SOFT_KEYWORDS_BEYOND_ECMASCRIPT,
])

export class CodeRuntime extends Service {
  language

  isolation

  constructor(ctx) {
    super(ctx, 'codeRuntime')
  }

  async run(request) {
    throw new Error('CodeRuntime.run is abstract and must be implemented by a subclass')
  }
}

export default CodeRuntime
