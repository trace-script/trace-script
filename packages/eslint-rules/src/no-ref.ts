import type { Rule } from './index'
import { createSimplePlugin } from 'eslint-factory'

export const noRef: Rule = createSimplePlugin({
  name: 'no-ref',
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === 'Identifier') {
          if (node.callee.name === 'ref') {
            context.report({
              node,
              message: 'Usage of ref() is restricted. Use shallowRef() or deepRef() instead.',
            })
          }
          else if (node.callee.name === 'readonly') {
            context.report({
              node,
              message: 'Usage of readonly() is restricted. Use shallowReadonly() or deepReadonly() instead.',
            })
          }
        }
      },
    }
  },
})
