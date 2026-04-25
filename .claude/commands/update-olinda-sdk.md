# update-olinda-sdk

Update the `olinda_copilot_sdk.ts` GitHub tarball dependency. Optionally pass a
target version tag (e.g. `/update-olinda-sdk v0.10.0`). When omitted, the latest
published release is resolved automatically.

## Steps

### 1. Check for uncommitted changes

Run `git status --porcelain`. If the output is non-empty, stop and tell the user
to commit or stash their changes first.

### 2. Read the current version

Read `package.json` and find the `olinda_copilot_sdk.ts` entry under
`dependencies` or `devDependencies`. Extract the semver tag from the tarball URL:

```
https://github.com/mpbarbosa/olinda_copilot_sdk.ts/archive/refs/tags/v0.9.1.tar.gz
                                                                       ^^^^^^^
```

If the key is absent, stop and report:
```
olinda_copilot_sdk.ts is not declared in package.json — nothing to update.
```

### 3. Resolve the target version

If `$ARGUMENTS` is non-empty, use it as the target version (add a leading `v` if
absent).

Otherwise fetch the latest published release tag:

```bash
gh api repos/mpbarbosa/olinda_copilot_sdk.ts/releases/latest --jq '.tag_name'
```

If that fails (no published releases), fall back to:

```bash
gh api repos/mpbarbosa/olinda_copilot_sdk.ts/tags --jq '.[0].name'
```

### 4. Short-circuit if already up to date

If the resolved target equals the current version, stop and report:
```
olinda_copilot_sdk.ts is already at <version> — nothing to do.
```

### 5. Rewrite package.json

Edit `package.json`: replace only the `olinda_copilot_sdk.ts` tarball URL, swapping
the old tag for the new one. Do not touch any other field.

New URL pattern:
```
https://github.com/mpbarbosa/olinda_copilot_sdk.ts/archive/refs/tags/<new-tag>.tar.gz
```

### 6. Run npm install

```bash
npm install
```

If this fails, restore the original `package.json` content, re-run `npm install`
to reinstate the previous lock file, and report the error.

### 7. Verify

```bash
npm run verify
```

This runs lint + type-check + build + tests in sequence. If any step fails,
restore the original `package.json`, re-run `npm install` to reinstate the
previous state, and report which step failed with the relevant output.

### 8. Commit

Stage and commit only `package.json` and `package-lock.json`:

```bash
git add package.json package-lock.json
git commit -m "chore(deps): update olinda_copilot_sdk.ts from <old> to <new>"
```

Report the result:
```
✓ olinda_copilot_sdk.ts updated from <old> → <new> and committed.
```
