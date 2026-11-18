---
description: "Create a <type>/<NNN>-<short-name> branch in a nested worktree at worktrees/<NNN>-<name>"
---

# Create Feature Worktree

Create the feature branch in a new nested git worktree at `worktrees/<NNN>-<short-name>` inside
the primary checkout. This command handles **branch + worktree creation only** — the spec
directory and files are created by the core `/speckit-specify` workflow afterwards.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty). When invoked as the
`before_specify` hook, the input is the feature description given to `/speckit-specify`.

## Steps

1. **Pick the branch type** from the feature description: `feat` (new capability), `fix`
   (defect), `refactor`, `docs`, `test`, `chore`. Default to `feat`. If the user explicitly named
   a type, use it.

2. **Generate a short name** (2-4 words, kebab-case, action-noun form, keep technical terms),
   e.g. "Fix payment processing timeout bug" → `payment-timeout`. Do not repeat the type in it.

3. **Sync the primary checkout at the start of the Spec Kit flow.** Before `/speckit-specify`,
   determine `MAIN_WORKTREE` from the first `worktree` line of `git worktree list --porcelain`.
   Record its current commit as `BEFORE_COMMIT`, then run:

   ```bash
   test "$(git -C "$MAIN_WORKTREE" symbolic-ref --short HEAD)" = main &&
   test -z "$(git -C "$MAIN_WORKTREE" status --porcelain)" &&
   git -C "$MAIN_WORKTREE" fetch origin main &&
   git -C "$MAIN_WORKTREE" merge-base --is-ancestor main origin/main &&
   git -C "$MAIN_WORKTREE" pull --ff-only origin main
   ```

   The primary checkout must be on `main`, clean, and an ancestor of `origin/main`. Stop and report
   the failed command when any check, fetch, or pull fails. Record the resulting commit as
   `MAIN_COMMIT` and set `UPDATED` by comparing it with `BEFORE_COMMIT`.

   Run this step in every case, including when the session is already inside a feature worktree.

4. **Create the branch and worktree.** The target state is: branch `<type>/<NNN>-<short-name>`
   checked out in a nested worktree at `worktrees/<NNN>-<short-name>` inside the primary checkout,
   with no tracking upstream, based on `origin/main` (or the `base_ref` in
   `worktree-config.yml`).

   Run the script from the repository root. It pushes the branch to `origin` before creating the
   worktree, so other developers see the number as taken; a failed push aborts with no worktree and
   no branch left behind.

   ```
   .specify/extensions/worktree/scripts/bash/create-worktree.sh --json --type "<type>" --short-name "<short-name>"
   ```

   - Do NOT create the worktree with a host-native worktree tool: that path skips the claim push.
   - Parse the JSON output: `BRANCH_NAME`, `FEATURE_NUM`, `FEATURE_NAME`, `FEATURE_DIRECTORY`,
     `WORKTREE_PATH`, `MAIN_WORKTREE`, `BASE_REF`, `CREATED`, `IN_WORKTREE`, `CLAIMED`.
   - Do NOT pass `--base-ref` unless the user asked for a specific base.
   - If `IN_WORKTREE` is `true`, the session is already inside a feature worktree — reuse it and
     skip to step 5.
   - If creation fails, stop and report the error. Do not retry by hand or continue without a
     confirmed result.

5. **Hand back to `/speckit-specify`** with the following values:
   - `SPECIFY_FEATURE_DIRECTORY = FEATURE_DIRECTORY` (`specs/<NNN>-<short-name>`) — treat as
     explicitly provided so the spec directory, feature number and branch all share one name.
   - The spec and all subsequent Spec Kit artifacts (`plan.md`, `tasks.md`) MUST be written inside
     `WORKTREE_PATH` (not the primary checkout), because `WORKTREE_PATH` is an independent
     checkout on `BRANCH_NAME`. If the agent can change its working directory, do so now;
     otherwise proceed and ensure every file path is relative to `WORKTREE_PATH`.

## Output

Report `BRANCH_NAME`, `WORKTREE_PATH`, `FEATURE_DIRECTORY`, `CLAIMED` and the primary checkout's
`MAIN_COMMIT` and `UPDATED` in one short block, then continue with the calling workflow.
