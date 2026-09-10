#!/usr/bin/env bash
# Prettier check scoped to git-TRACKED files.
#
# Why not `prettier --check .`: that walks the working tree, so untracked
# scratch files (probes, notes, editor droppings) fail the pre-push gate even
# though `git push` never sends them. Anything you can commit must be pushable,
# so the gate must look at what git actually tracks — nothing more.
#
# Files tracked but deleted in the working tree are skipped (`-f` test): the
# deletion is not committed, so it is not part of what is being pushed.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

files=()
while IFS= read -r -d '' file; do
  [ -f "$file" ] && files+=("$file")
done < <(git ls-files -z)

[ ${#files[@]} -eq 0 ] && exit 0

exec pnpm exec prettier --check --ignore-unknown "${files[@]}"
