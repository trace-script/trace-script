import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isConventionalCommit } from '../../scripts/verify-commit.mjs'

describe('commit message validation', () => {
  it.each(['feat(sdk): add batching', 'fix: handle disconnects', 'feat(protocol)!: require versioned events', 'docs: describe validation\n\nExplain the change.'])('accepts %s', (message) => {
    expect(isConventionalCommit(message)).toBe(true)
  })

  it.each(['', 'Add batching', 'Feat: add batching', 'feat(): add batching', 'fix: ', 'fix:something'])('rejects %s', (message) => {
    expect(isConventionalCommit(message)).toBe(false)
  })

  it('reads the hook argument when .git is a worktree pointer file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'trace-commit-'))
    const script = fileURLToPath(new URL('../../scripts/verify-commit.mjs', import.meta.url))
    const messagePath = join(directory, 'COMMIT_EDITMSG')
    try {
      writeFileSync(join(directory, '.git'), 'gitdir: /worktrees/example')
      writeFileSync(messagePath, 'fix(tooling): validate a worktree commit')
      expect(spawnSync(process.execPath, [script, messagePath], { cwd: directory }).status).toBe(0)
      writeFileSync(messagePath, 'Invalid subject')
      expect(spawnSync(process.execPath, [script, messagePath], { cwd: directory }).status).toBe(1)
      expect(spawnSync(process.execPath, [script], { cwd: directory }).status).toBe(1)
    }
    finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
