import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function isConventionalCommit(message) {
  const subject = message.trim().split('\n')[0]
  return /^(?:feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|release)(?:\([^()\r\n]+\))?!?: [^\r\n]+$/.test(subject)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const messagePath = process.argv[2]
  if (!messagePath || !isConventionalCommit(readFileSync(messagePath, 'utf8'))) {
    console.error('Use a Conventional Commit subject, for example: feat(sdk): add batching')
    process.exitCode = 1
  }
}
