---
name: update-olinda-sdk
description: >
  Update the olinda_copilot_sdk.ts GitHub tarball dependency to the latest
  published release tag (or a specific target version). Reads the current
  version from package.json, resolves the desired version, rewrites the
  tarball URL, runs npm install, validates with the project's verify command,
  and commits the change. Use this skill when asked to bump, upgrade, or
  update olinda_copilot_sdk.ts.
parameters:
  project_root:
    description: >
      Root directory of the project whose package.json declares
      olinda_copilot_sdk.ts as a dependency.
      Defaults to the current working directory.
    default: $PWD
  target_version:
    description: >
      Specific semver tag to update to (e.g. "v0.10.0").
      When omitted the skill resolves the latest published tag from GitHub.
    default: ""
---

## Purpose

`olinda_copilot_sdk.ts` is installed from a GitHub release tarball rather than
the npm registry:

```json
"olinda_copilot_sdk.ts": "https://github.com/mpbarbosa/olinda_copilot_sdk.ts/archive/refs/tags/v0.9.1.tar.gz"
```

Because npm cannot auto-update GitHub tarball URLs, this skill performs the
update end-to-end: version discovery → `package.json` rewrite → install →
verify → commit.

---

## Step-by-step workflow

### 1. Read the current version

Open `$project_root/package.json` and locate the `olinda_copilot_sdk.ts` entry
under `dependencies` or `devDependencies`. Extract the semver tag embedded in
the tarball URL (the segment that matches `/refs/tags/vX.Y.Z`).

```
current: https://github.com/mpbarbosa/olinda_copilot_sdk.ts/archive/refs/tags/v0.9.1.tar.gz
         → current version = v0.9.1
```

If the entry is missing, stop and report:

```
olinda_copilot_sdk.ts is not declared in package.json — nothing to update.
```

### 2. Resolve the target version

**If `target_version` was provided:** use it directly (add a leading `v` if
absent so the tag matches the GitHub convention).

**If `target_version` is empty:** fetch the latest published release tag from
the GitHub API:

```bash
gh api repos/mpbarbosa/olinda_copilot_sdk.ts/releases/latest --jq '.tag_name'
```

If the API call fails (e.g. no published releases) fall back to listing tags:

```bash
gh api repos/mpbarbosa/olinda_copilot_sdk.ts/tags --jq '.[0].name'
```

### 3. Short-circuit if already up to date

Compare the resolved target version with the current version. If they are equal,
stop and report:

```
olinda_copilot_sdk.ts is already at <version> — nothing to do.
```

### 4. Rewrite package.json

Replace only the tarball URL value for the `olinda_copilot_sdk.ts` key.
The new URL follows the same pattern as the existing one, with the old tag
replaced by the new tag:

```
https://github.com/mpbarbosa/olinda_copilot_sdk.ts/archive/refs/tags/<new-tag>.tar.gz
```

Do **not** modify any other field in `package.json`. Preserve formatting and
key ordering exactly as found.

### 5. Run npm install

```bash
npm install
```

Run this from `$project_root`. It regenerates `package-lock.json` with the new
resolved URL and installs the updated package. If the install fails, restore the
original `package.json` content and report the error.

### 6. Verify

Run the project's full verification suite from `$project_root`:

```bash
npm run verify
```

`verify` runs lint + type-check + build + tests in sequence. If any step fails,
restore the original `package.json`, re-run `npm install` to reinstate the
previous lock file, and report which step failed with the relevant output.

### 7. Commit

If verification passes, stage and commit the changed files:

```bash
git add package.json package-lock.json
git commit -m "chore(deps): update olinda_copilot_sdk.ts from <old> to <new>"
```

Use the exact message format above, substituting the real version strings.

---

## Constraints

- Only rewrite the `olinda_copilot_sdk.ts` URL. Do not touch other dependencies.
- Do not push to the remote. Leave that to the human.
- Do not skip `npm run verify`. A passing install is not sufficient — type-check
  and tests must also pass before committing.
- If `package-lock.json` is not tracked by git, still stage it if it exists.
- If the repository has uncommitted changes before the skill runs, stop and ask
  the user to commit or stash them first.

---

## Expected output

On success, report a one-line summary:

```
✓ olinda_copilot_sdk.ts updated from v0.9.1 → v0.10.0 and committed.
```

On no-op:

```
olinda_copilot_sdk.ts is already at v0.9.1 — nothing to do.
```

On failure, report which step failed and what was restored:

```
✗ npm run verify failed at type-check. Restored package.json to v0.9.1.
  <relevant tsc output>
```
