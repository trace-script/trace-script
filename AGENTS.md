# Agent Guidelines

These rules apply to every agent working in this repository and cover the entire repository.

## 1. Branches, Commits, and Pull Requests

- Do not reference, describe, or discuss the contents of the `main` branch in any output, including user communication, documentation, code comments, commit messages, or PR titles and bodies. This branch name appears here solely to state the prohibition.
- Make all changes and commits on the working branch for the current task. Do not modify, commit, or push directly to `main`.
- Only mention working branches relevant to the current task. Before mentioning a working branch, create its corresponding PR and include the PR link with the mention.
- Every working branch that delivers changes must have a corresponding PR. Do not merge a PR unless the user explicitly requests it.
- **PR titles and bodies must be entirely in English.** Commit messages must also be in English.
- Commit messages and PR titles must follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

  ```text
  <type>[optional scope][!]: <description>
  ```

  Use `feat` for new features and `fix` for bug fixes. Choose an appropriate type for other changes, such as `docs`, `refactor`, `test`, or `chore`. Mark breaking changes with `!` or `BREAKING CHANGE:` and explain their impact.
- Write PR bodies in English and explain the problem, final changes, validation results, and applicable ablation findings and limitations. PR bodies do not need to follow the commit title format.

## 2. TypeScript Type Restrictions

- When writing, adding, or modifying TypeScript type definitions, agents **must not use `null`, `undefined`, `any`, or `unknown` without explicit user confirmation**.
- This restriction covers type annotations, type aliases, interface members, union and intersection types, generic parameters and constraints, function parameter and return types, type assertions, and type definitions in declaration files.
- Prefer precise domain types, literal types, discriminated unions, and accurate generic constraints. Keep type definitions consistent with the actual data.
- Do not bypass these restrictions through type assertions, indirect aliases, suppressed type checks, or disabled checks. Do not declare types that misrepresent runtime data to avoid the restrictions.
- If a restricted type is necessary, first explain its exact location, rationale, alternatives, and impact to the user. Obtain explicit confirmation before writing it. Confirmation applies only to the approved scope and does not authorize future uses by default.
- These rules do not require a bulk rewrite of existing types. Ordinary runtime value checks are not type definitions, but must not be used to introduce restricted types.

## 3. Code Quality and Ablation Experiments

- When writing or modifying code, perform ablation experiments scoped to the current change: remove candidate abstractions, wrappers, configuration, or layers of indirection one at a time to determine whether they are necessary.
- First define the behavior to preserve and the acceptance criteria. Remove one candidate design at a time and compare the results before and after removal using the same inputs and relevant checks.
- Keep the simpler implementation if it still meets the requirements and improves readability and maintainability. If a design must be retained, record the scenario that fails when it is removed and the supporting evidence.
- Prefer clear names, direct control flow, and small functions with clear responsibilities. Remove unnecessary abstractions, duplicate wrappers, ineffective branches, dead code, and extension points added only for hypothetical future needs.
- Do not use fewer lines of code as the sole success criterion. Preserve necessary boundary validation, error handling, and actual business rules to maintain readability, correctness, and maintainability.
- Match validation to the risk of the change. Use existing relevant tests, type checks, or necessary behavior checks. Measure performance only when there is a performance goal. Do not add unrelated tests or complex experiment frameworks for simple, reversible changes.
- Explain the removed designs, comparison methods, and results in the PR. If there is no applicable code design to ablate, state why ablation is not applicable. Never invent experiment results. Documentation-only changes require content and formatting checks.
