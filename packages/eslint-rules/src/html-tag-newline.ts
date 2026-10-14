import { createSimplePlugin } from 'eslint-factory'

const htmlTagNewline: ReturnType<typeof createSimplePlugin> = createSimplePlugin({
  name: 'html-tag-newline',
  description: 'Require a line break between adjacent HTML tags.',
  create(context) {
    return {
      Program(node) {
        const { text } = context.sourceCode
        const pattern = /<\/([\w:-]+)>[\t ]*<([\w:-]+)(?=[\t\n\r />])/g

        for (const match of text.matchAll(pattern)) {
          const [matchedTags, closingTagName] = match
          const matchOffset = match.index
          const closingTagEnd = matchOffset + `</${closingTagName}>`.length

          if (/[\r\n]/.test(matchedTags))
            continue

          context.report({
            node,
            message: 'Add a line break between adjacent HTML tags.',
            fix: fixer => fixer.replaceTextRange(
              [closingTagEnd, matchOffset + matchedTags.length],
              `\n${matchedTags.slice(matchedTags.lastIndexOf('<'))}`,
            ),
          })
        }
      },
    }
  },
})

export default htmlTagNewline
