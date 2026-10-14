import type { Rule } from './index'
import { createSimplePlugin } from 'eslint-factory'

/**
 * Require a line break before the first property in long object expressions.
 * Objects with three or fewer properties,
 * or 140 characters or fewer are left untouched.
 */
export const objectExpressionNewline: Rule = createSimplePlugin({
  name: 'object-expression-newline',
  create(context) {
    const { sourceCode } = context

    return {
      ObjectExpression(node) {
        if (node.properties.length <= 3)
          return

        if (sourceCode.text.slice(node.range[0], node.range[1]).length <= 140)
          return

        const firstProperty = node.properties[0]
        if (!firstProperty)
          return

        if (sourceCode.text.slice(node.range[0] + 1, firstProperty.range[0]).includes('\n'))
          return

        context.report({
          node,
          message: 'Add a line break before the first property of a long object expression.',
          fix: fixer => fixer.insertTextBefore(firstProperty, '\n'),
        })
      },
    }
  },
})
