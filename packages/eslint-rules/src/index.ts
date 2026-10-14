import type { createSimplePlugin } from 'eslint-factory'
import { htmlTagNewline } from './html-tag-newline'
import { noRef } from './no-ref'
import { noRelativeSrcImport } from './no-relative-src-import'
import { noTsImportExtension } from './no-ts-import-extension'
import { objectExpressionNewline } from './object-expression-newline'
import { pxToRem } from './px-to-rem'

export type Rule = ReturnType<typeof createSimplePlugin>

const eslintRules: Array<Rule> = [
  noTsImportExtension,
  objectExpressionNewline,
  pxToRem,
  noRef,
  noRelativeSrcImport,
  htmlTagNewline,
]

export default eslintRules
