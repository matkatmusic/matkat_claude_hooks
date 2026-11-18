#!/bin/zsh
# Usage: newWorktree.sh <repo folder> <branch>
# Progress goes to stderr. The last stdout line is the worktree path, for the WorktreeCreate hook.
set -e
repoDir=$(git -C $1 rev-parse --show-toplevel)
repoName=${repoDir:t}
branchName=$2
worktreeDir=~/Programming/$repoName-worktrees/$branchName

baseCommit=$(git -C $repoDir rev-parse HEAD)
git -C $repoDir worktree add $worktreeDir -b $branchName $baseCommit >&2

if [[ -f $worktreeDir/.gitmodules ]]; then
    # Fetch submodule commits from the local copy, so unpushed commits work.
    git -C $worktreeDir submodule init >&2
    submodulePaths=("${(@f)$(git -C $worktreeDir config -f .gitmodules --get-regexp '\.path$' | awk '{print $2}')}")
    for submodulePath in $submodulePaths; do
        git -C $worktreeDir config submodule.$submodulePath.url $repoDir/$submodulePath
    done
    git -C $worktreeDir -c protocol.file.allow=always submodule update --recursive >&2
fi

if [[ -f $repoDir/dispatcher/user-dispatch.json ]]; then
    cp $repoDir/dispatcher/user-dispatch.json $worktreeDir/dispatcher/
fi

if [[ -f $worktreeDir/package.json ]]; then
    (cd $worktreeDir && bun install >&2)
fi

searchDir=${repoDir:h}
nodeModulesDir=""
while true; do
    if [[ -d $searchDir/node_modules ]]; then
        nodeModulesDir=$searchDir/node_modules
        break
    fi
    if [[ $searchDir == / ]]; then
        break
    fi
    searchDir=${searchDir:h}
done
if [[ -n $nodeModulesDir ]]; then
    ln -sfn $nodeModulesDir ~/Programming/$repoName-worktrees/node_modules
fi

# Stop with an error if any submodule is still empty or on the wrong commit.
if git -C $worktreeDir submodule status --recursive | rg '^[-+U]' >&2; then
    echo "submodule setup failed" >&2
    exit 1
fi
echo $worktreeDir
