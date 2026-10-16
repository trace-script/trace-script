# PR Body Guidance

Build the PR body from the repository's `.github/PULL_REQUEST_TEMPLATE.md`, which defines three sections: `Linked issue`, `Context`, and `Description`. Fill each section with content and remove the template's HTML-comment instructions. The body stays in ordinary Markdown; it does not need a commit-message prefix.

PR titles and commit messages must follow [Conventional Commits requirements](conventional-commits.md).

## Linked issue

Mention the open issue this change resolves or references. Use `resolves #123` or `fixes #123` only when merging should close the issue; otherwise use `refs #123`.

## Context

Explain the trigger or prior behavior, why this change is needed, and the reason for the approach. For a forge-related change, name the forge and, for a self-hosted forge, its version. Avoid listing edited files as the explanation.

````markdown
### 🔗 Linked issue

fixes #123

### 🧭 Context

Repeated Enter presses while submission was pending could create duplicate
requests. The form now ignores repeat submissions until the current request
completes.
````

For a stacked PR, identify the parent and the scope of this PR, for example: `Stacked on #120; this PR adds cancellation to the upload flow introduced there.` Only include a commit count when verified against the selected base.

## Description

Describe the change in detail: what problem it solves, how, and the final behavior. Fold in verification results, ablation findings, and limitations. Use the subheadings below only when they help a reviewer assess this change.

### Verification

Record exact commands, their outcomes, and what the results establish. Include relevant manual checks and material limitations. Replace all example values with actual results.

````markdown
### 📚 Description

Submissions now resolve through `SubmitController`, which rejects a submit
while a request is already pending, then clears the pending state when it
settles.

#### Verification

- `pnpm vitest run tests/submit.test.ts`: passed; covers repeated submission and retry after failure.
- `pnpm typecheck`: passed.
- Manual check: repeated Enter presses produce one request while the button shows its pending state.
- Not verified: behavior against the production service.
````

If a check fails, state the failure and whether it blocks readiness. If the failure is pre-existing, support that claim with a comparison or existing evidence. Never invent test names, counts, commands, or outcomes.

### Ablation

When a candidate abstraction, wrapper, or layer of indirection was removed and kept simpler, state what was removed, how the before/after were compared, and the result. If a design was retained, note the scenario that fails without it. If no code design was removed, state that ablation is not applicable. Never invent experiment results.

### Change map

Use a table when several modules change or responsibility moves across a boundary. Organize rows by behavior or responsibility.

````markdown
#### Change map

| Module | Before | After | Reason |
| --- | --- | --- | --- |
| `upload/client` | Returned a generic error | Preserves the server's size error | Callers can distinguish file size failures |
| `cli/upload` | Printed a generic failure | Shows a size-specific hint | Users can choose a smaller file |
````

Omit this section when the description already explains the whole change.

### Architecture and behavior

Use a Mermaid flow, sequence, or state diagram only when it clarifies changed ordering, module responsibilities, asynchronous work, or state transitions. Tie participants and arrows to actual symbols and code branches. Omit diagrams for edits without meaningful flow changes.

````markdown
#### Architecture and behavior

```mermaid
sequenceDiagram
  participant F as Form
  participant C as SubmitController
  participant A as API
  F->>C: submit(data)
  alt request already pending
    C-->>F: ignore repeated submission
  else idle
    C->>A: send(data)
    A-->>C: result
    C-->>F: clear pending state
  end
```
````

### Boundaries and risks

Use a table for concrete invariants, migrations, external effects, or unresolved failure modes. Include only relevant rows and connect each protection to evidence.

````markdown
#### Boundaries and risks

| Boundary | Failure mode | Protection | Evidence or gap |
| --- | --- | --- | --- |
| Pending request | Duplicate submission | Controller rejects repeated submit calls | Repeat-submission test passes |
| Failed request | Form remains disabled | Pending state clears on rejection | Error-recovery test passes |
| Server processing | Duplicate work across clients | Requires server-side idempotency | Outside this change; not verified |
````

Consider input validation, authorization, retries, concurrency, ordering, cleanup, schema compatibility, and UI loading/error states only where the diff touches them. Write `Not verified` when evidence is missing.

### Visual changes

For user-visible UI changes, include comparable before/after images and labels. Read [Visual evidence](visual-evidence.md) for capture and upload procedures. Use uploaded URLs in a published body unless the chosen attachment tool rewrites local paths.

````markdown
#### Visual changes

| Before | After |
| --- | --- |
| ![Connection settings before](BEFORE_IMAGE_URL) | ![Connection settings after](AFTER_IMAGE_URL) |
| Connection settings, 1440x900, dark | Connection settings, 1440x900, dark |
````

Replace the example URLs before publication. Label a newly introduced state `Absent before` and a deleted state `Removed after` rather than inventing a counterpart screenshot.

### Rollout and follow-up

Include required migrations, feature flags, deployment ordering, or known gaps when they affect review or release. State which gaps block merge and which are optional follow-up work. Do not invent deployment or monitoring commitments.

For a breaking change, explain the incompatible behavior, affected callers, and migration steps. Keep this explanation consistent with the PR title's `!` and the relevant commit's breaking-change marker.

<!-- Adapted from https://github.com/antfu/skills/blob/main/skills/antfu-create-pr/references/pr-body.md -->