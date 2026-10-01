---
name: create-pr
description: Prepare or create a reviewable GitHub pull request from the current branch, enforcing Conventional Commits for commit messages and PR titles, with an evidence-based body, focused verification, and before/after evidence for UI changes. Use when asked to prepare, open, create, or publish a PR.
---

# Create Pull Request

Create a PR that explains the problem, resulting behavior, and reason for the approach. Conventional Commits is mandatory for commit messages and PR titles. Keep the description proportional to the change and follow compatible repository conventions.

## Workflow

1. Inspect the working tree, current branch, remotes, target repository, and default branch. Read applicable `AGENTS.md`, `CONTRIBUTING.md`, and `.github/PULL_REQUEST_TEMPLATE*` files. Check whether the current branch already has a matching PR. Return its URL for a preparation request or update it within the requested publication scope instead of creating a duplicate.
2. Determine the intended base and head branches. Inspect the exact `base...head` diff and its merge base. For a stacked PR, use the intended parent branch and describe only this PR's own changes. If the parent relationship is unclear, resolve it before publishing.
3. Read the full committed diff, staged diff, unstaged diff, and relevant callers or entry points. Inspect relevant untracked files separately. Distinguish runtime changes from generated files, lockfiles, and snapshots. Establish which changes belong to the requested PR and preserve unrelated work. For publication, complete any necessary scoped commit using Conventional Commits before finalizing the diff, checks, and screenshots. For preparation only, state whether the description covers the committed head or includes changes planned for a later commit; do not commit just to draft a description.
4. Read [Conventional Commits requirements](references/conventional-commits.md), then draft a compliant PR title and body. Read [PR body guidance](references/pr-body.md) to choose useful sections and examples. Honor the repository's body template rather than replacing it with a fixed structure.
5. Run checks appropriate to the changed behavior and repository requirements. Record actual commands, results, and material gaps. If unrelated working-tree edits can affect the results, verify the intended content in an isolated checkout or disclose that limitation. Reuse current results when they cover the same revision and scope.
6. For user-visible UI changes, read [Visual evidence](references/visual-evidence.md), capture comparable before/after states, inspect the images, and prepare attachment URLs or files.
7. Save the final body to a temporary Markdown file. Before publishing, validate the PR title and PR-only non-merge commit messages against [Conventional Commits requirements](references/conventional-commits.md). Correct generated messages before committing. If existing messages fail, report the offending commits and proposed correction; do not push or publish until corrected. For a preparation-only request, return the compliant title, body file, verification results, and any commit-message blockers. When creation or publication is requested, confirm the final diff, checks, body, and screenshots still describe the intended head, push that branch, and create the PR with explicit `--base`, `--head`, `--title`, and `--body-file` (or update the matching PR). If the content changed after verification, refresh the affected evidence. Use `--draft` when requested or when the work is not ready for review, and explain outstanding blockers. Draft status does not bypass the Conventional Commits requirement.
8. Verify the created PR's repository, base, head, compliant title, body, and draft status. Inspect rendered tables, diagrams, and screenshots where applicable. In Codex, attach every created PR to the chat with `mcp__codex_app__attach_artifact` when available. Return the PR URL and any material verification gaps.

Creating a PR does not automatically include merging it, requesting specific reviewers, or posting follow-up review replies. Handle those actions when the user requests them.

## Commit Messages and PR Titles

Use [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) for every commit authored by this workflow and every PR title it prepares, creates, or updates:

```text
<type>[optional scope][!]: <description>
```

Examples:

```text
feat(scope): add upload retry
fix(scope): prevent duplicate submission
refactor: extract diff parser
chore(deps): update build tooling
docs: clarify worktree setup
refactor(api)!: require an explicit upload destination
```

Use `feat` for a new capability and `fix` for a bug correction. Other types may describe different work; choose repository-established scopes and compatible type rules. A real breaking change must be identified and explained. Read [Conventional Commits requirements](references/conventional-commits.md) for types, breaking changes, footers, and the publication gate.

For this skill, use lowercase types, concise imperative descriptions, and no trailing period; aim for approximately 70 characters or fewer. These are writing conventions added by this skill. A repository may tighten compatible rules, but its existing free-form titles must not weaken the mandatory Conventional Commits format. This requirement governs commit messages and PR titles; PR bodies still use readable Markdown and the repository's template.

## Body

Cover these points in the repository's template, or use `## Summary` and `## Verification` when no template exists:

- The concrete problem or capability, the resulting behavior, and why this approach.
- Actual verification commands and outcomes, including anything important that remains unverified.
- Related issues when they exist. Use `closes #123` or `fixes #123` only when merging should close that issue; otherwise use `refs #123`.

Add a change map, behavior diagram, risk table, visual comparison, or rollout notes only when they help a reviewer assess this change. See [PR body guidance](references/pr-body.md).

## Writing and Evidence

- Support architectural and compatibility claims with code paths, symbols, tests, or observed behavior. State assumptions and gaps plainly.
- Describe this PR's changes without attributing inherited parent-branch work to it.
- A passing check supports only the behavior and revision it covers. Do not describe failing or skipped checks as passing.
- Write directly and omit filler. Use plain hyphens in prose.
- Keep credentials, personal records, and sensitive payloads out of descriptions, logs, and screenshots.
- Store PR-only screenshots and body files outside tracked source. Follow the repository's disclosure rules for agent assistance; do not invent attestations or mark unchecked template items complete.
