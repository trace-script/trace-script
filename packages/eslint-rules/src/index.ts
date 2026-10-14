import htmlTagNewline from './html-tag-newline'
import noRef from './no-ref'
import noRelativeSrcImport from './no-relative-src-import'
import noTsImportExtension from './no-ts-import-extension'
import objectExpressionNewline from './object-expression-newline'
import pxToRem from './px-to-rem'

const eslintRules: Array<typeof noTsImportExtension> = [
  noTsImportExtension,
  objectExpressionNewline,
  pxToRem,
  noRef,
  noRelativeSrcImport,
  htmlTagNewline,
]

export default eslintRules
