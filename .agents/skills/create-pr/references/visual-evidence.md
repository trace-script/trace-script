# Visual Evidence

Capture comparable evidence for the user-visible states affected by the PR. Keep screenshots outside tracked source, and publish them through an available attachment workflow.

## Capture Comparable States

1. Identify the affected pages, routes, dialogs, components, breakpoints, themes, and locales. For a shared component or global style change, cover materially different consumers. Prefer existing stories or end-to-end scenarios.
2. Assign stable state names such as `settings-connection` so captures and labels remain easy to match.
3. Use the previously determined target reference and merge base for the before revision, and the intended PR head for the after revision. If the UI difference is caused by an earlier parent-branch change, exclude it from this PR's comparison.
4. Run the before revision in an isolated temporary worktree. Use a unique path and the actual target reference; do not assume the default branch is `origin/main`.

   ```bash
   # Set pr_target_ref to the target reference determined for this PR.
   pr_base_commit=$(git merge-base "$pr_target_ref" HEAD)
   pr_capture_dir=$(mktemp -d "${TMPDIR:-/tmp}/create-pr-shots.XXXXXX")
   git worktree add --detach "$pr_capture_dir/base-worktree" "$pr_base_commit"
   mkdir -p "$pr_capture_dir/shots/base" "$pr_capture_dir/shots/head"
   ```

5. Capture both revisions with the repository's existing tools, such as Playwright, Storybook, Histoire, or an available browser tool. Use identical viewport, theme, locale, fixture data, and readiness conditions. Run servers on separate ports when both are active.
6. Ensure after captures match the revision being published. Uncommitted work can otherwise make screenshots disagree with the PR diff.
7. Inspect every image. Retake blank, unintended loading/error, or unstable captures. If an error or loading state is the subject of the change, label it explicitly. Redact sensitive data before uploading.
8. Use `Absent before` or `Removed after` for states with no counterpart. Record blocked or missing captures and their effect on readiness; do not claim an unavailable comparison was verified.

Remove the temporary worktree when capture is finished, without force-removing work:

```bash
git worktree remove "$pr_capture_dir/base-worktree"
```

Keep the screenshots until attachment and PR rendering are verified. Stop servers and remove only temporary resources created for this task when they are no longer needed.

## Attach Screenshots

Check the installed CLI's capabilities before selecting a workflow:

```bash
gh pr create --help
```

### When `--attach` Is Supported

Use local image paths in the body and pass the matching files as attachments. Confirm the supported syntax in the installed command's help. The following example applies only to a CLI that supports `--attach`:

````markdown
## Visual changes

| Before | After |
| --- | --- |
| ![Connection settings before](/absolute/temp/path/shots/base/settings-connection.png) | ![Connection settings after](/absolute/temp/path/shots/head/settings-connection.png) |
| Connection settings, 1440x900, dark | Connection settings, 1440x900, dark |
````

```bash
gh pr create \
  --base "$pr_base_branch" \
  --head "$pr_head_branch" \
  --title "fix(settings): keep connection form visible on narrow screens" \
  --body-file "$pr_body_file" \
  --attach "$pr_capture_dir/shots/base/settings-connection.png" \
  --attach "$pr_capture_dir/shots/head/settings-connection.png"
```

Replace the example paths with actual paths. Attachment paths must match paths in the body exactly. Check `gh pr edit --help` separately before using attachments on an existing PR.

### When `--attach` Is Unavailable

Use an available GitHub browser upload flow or an established repository attachment tool within the user's requested PR work. Insert the resulting attachment URLs in the body. Do not assume another project's upload script exists, expose an authentication token, or depend on an undocumented upload endpoint.

If no upload route is available, preserve the local captures and report their paths and the limitation. Keep a preparation-only result local; if PR creation is requested, describe the missing evidence and use a draft when it prevents review readiness. Never publish local filesystem paths as rendered screenshot evidence or commit PR-only images to bypass an upload failure.

## Verify the Published Result

Open the PR and confirm every image renders, has the right label, and corresponds to the intended revision and state. A successful upload alone does not verify the rendered comparison. Do not diagnose an attachment as broken solely from an anonymous URL probe; verify it in the authenticated PR view.

<!-- Adapted from https://github.com/antfu/skills/blob/main/skills/antfu-create-pr/references/visual-evidence.md -->
