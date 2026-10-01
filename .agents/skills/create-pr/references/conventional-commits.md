# Conventional Commits Requirements

Use [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). This skill makes compliance a publication requirement for PR titles and PR-only non-merge commits, including drafts. Follow compatible repository commitlint rules in addition to the specification.

## Message Structure

```text
<type>[optional scope][!]: <description>

[optional body]

[optional footers]
```

Require a type, colon followed by a space, and a nonempty description. Scope is optional and names a codebase area in parentheses. Separate optional body and footers with blank lines. Use trailer-style footers such as `Refs: #123`; never invent reviewer or sign-off attestations.

Use `feat` for features and `fix` for bug fixes. Other types are allowed. Common choices are `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `style`, and `revert`. Apply repository type restrictions when compatible; do not label a feature or fix as `chore` just to satisfy a misleading existing convention.

This skill additionally requires lowercase types and concise imperative descriptions without a trailing period. A scope must be meaningful, not added solely to match an example. Describe the primary resulting behavior in the PR title; individual commits should describe their own changes.

## Breaking Changes

The specification accepts `!` immediately before the colon or a `BREAKING CHANGE: <explanation>` footer. Breaking changes can occur with any type. The footer marker must be uppercase; `BREAKING-CHANGE` is an equivalent footer token.

For this workflow, require `!` in a breaking PR's title so its squash-commit subject retains the signal, and describe the incompatible change in that title. For a commit using `!`, its subject description must explain the breaking change. A commit marked only through a breaking-change footer must explain the incompatibility in that footer. Document the affected behavior and migration in the PR body. Do not mark an internal refactor as breaking without an actual compatibility impact.

```text
refactor(api)!: require an explicit upload destination

BREAKING CHANGE: upload callers must now pass a destination argument.
```

## Publication Gate

- Validate every proposed PR title before returning it, creating a PR, or updating an existing PR. Never fall back to a free-form title.
- Inspect complete messages for PR-only non-merge commits using the chosen base and head. For example, with both references already determined:

  ```bash
  git log --no-merges --format='%H%n%B%n---' "$pr_base_ref..$pr_head_ref"
  ```

- Exclude commits reachable from the selected parent branch of a stacked PR. Exempt generated merge commits from this message check; do not exempt ordinary feature-branch commits because the repository uses squash merging.
- Validate syntax, correct type, meaningful scope when present, and breaking-change information. A subject-only regex cannot establish full compliance. Run an existing commitlint check when available and inspect semantic requirements yourself; do not install or change repository lint configuration solely to prepare a PR.
- Fix messages for commits this workflow is about to author before creating them. For existing noncompliant commits, report their hashes and proposed messages, prepare the remaining PR material, and resolve the messages before pushing or publishing. A compliant PR title alone does not satisfy this skill's commit requirement.
- Amend or rebase only within existing user authorization. Do not rewrite shared history or force-push solely to satisfy this gate. If necessary authorization is absent, present the concrete repair plan and ask before changing history.
- A draft may record code or verification gaps, but it must still pass this message gate. Preparation-only work may return ready-to-use title/body material with outstanding commit corrections clearly identified.
