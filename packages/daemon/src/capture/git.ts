import { execFileSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const HOOK_START = "# >>> bodhi git >>>";
const HOOK_END = "# <<< bodhi git <<<";
const HOOK_NAMES = ["post-commit", "post-checkout", "post-merge", "post-rewrite"] as const;
const ZERO_SHA = "0000000000000000000000000000000000000000";
const SHELL_RELATIVE_CWD = "$" + '{cwd#"$root"/}';
const SHELL_COMMON_DIR_ABSOLUTE = "$" + "{common_dir#/}";
const SHELL_GIT_DIR_ABSOLUTE = "$" + "{git_dir#/}";
const SHELL_FILES_APPEND = "$" + "{files_text}" + "$" + "{path}\n";
const SHELL_ARG_1 = "$" + "{1:-}";
const SHELL_ARG_2 = "$" + "{2:-}";
const SHELL_ARG_3 = "$" + "{3:-}";
const SHELL_ARG_1_ZERO = "$" + "{1:-0}";

export type SupportedGitHook = (typeof HOOK_NAMES)[number];

export interface GitHookOptions {
	dataDir: string;
	socketPath: string;
}

export interface InstallGitHooksOptions extends GitHookOptions {
	cwd: string;
}

export interface GitHookInstallResult {
	changedHooks: SupportedGitHook[];
	hooksDir?: string;
	repoRoot?: string;
	skippedReason?: "git-not-found" | "not-a-git-repo";
}

interface GitHookTarget {
	hooksDir: string;
	repoRoot?: string;
}

function shellSingleQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function runGit(cwd: string, args: string[]): string | null {
	try {
		return execFileSync("git", ["-C", cwd, ...args], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

function resolveGitOutputPath(cwd: string, rawPath: string | null): string | undefined {
	if (!rawPath) {
		return undefined;
	}

	if (rawPath.startsWith("/")) {
		return realpathSync(rawPath);
	}

	return realpathSync(resolve(cwd, rawPath));
}

export function resolveGitHookTarget(cwd: string): GitHookTarget | undefined {
	const commonDir =
		resolveGitOutputPath(
			cwd,
			runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
		) ?? resolveGitOutputPath(cwd, runGit(cwd, ["rev-parse", "--git-common-dir"]));
	if (!commonDir) {
		return undefined;
	}

	const repoRoot =
		resolveGitOutputPath(
			cwd,
			runGit(cwd, ["rev-parse", "--path-format=absolute", "--show-toplevel"]),
		) ?? resolveGitOutputPath(cwd, runGit(cwd, ["rev-parse", "--show-toplevel"]));

	return {
		hooksDir: join(commonDir, "hooks"),
		repoRoot,
	};
}

function stripGitHookBlock(contents: string): string {
	const blockPattern = new RegExp(`\\n?${HOOK_START}[\\s\\S]*?${HOOK_END}\\n?`, "g");
	return contents.replace(blockPattern, (_match, offset) => {
		if (offset === 0) {
			return "";
		}
		return "\n";
	});
}

function buildGitHelpers(options: GitHookOptions): string {
	return [
		`__bodhi_sock=${shellSingleQuote(options.socketPath)}`,
		`__bodhi_spool=${shellSingleQuote(join(options.dataDir, "git-hook-spool.$$.jsonl"))}`,
		"__bodhi_normalize_dir() {",
		'  target="$1"',
		'  [ -n "$target" ] || return 1',
		'  [ -d "$target" ] || return 1',
		'  (cd "$target" 2>/dev/null && pwd -P) || return 1',
		"}",
		"__bodhi_git_state() {",
		'  git_dir="$1"',
		'  branch="$2"',
		'  state="normal"',
		'  if [ -d "$git_dir/rebase-merge" ] || [ -d "$git_dir/rebase-apply" ]; then',
		'    state="rebasing"',
		'  elif [ -f "$git_dir/MERGE_HEAD" ]; then',
		'    state="merging"',
		'  elif [ -f "$git_dir/CHERRY_PICK_HEAD" ]; then',
		'    state="cherry-picking"',
		'  elif [ -f "$git_dir/REVERT_HEAD" ]; then',
		'    state="reverting"',
		'  elif [ -f "$git_dir/BISECT_LOG" ]; then',
		'    state="bisecting"',
		'  elif [ -z "$branch" ]; then',
		'    state="detached"',
		"  fi",
		"  printf '%s' \"$state\"",
		"}",
		"__bodhi_relative_cwd() {",
		'  root="$1"',
		'  cwd="$2"',
		'  [ -n "$root" ] || return 0',
		'  [ -n "$cwd" ] || return 0',
		'  if [ "$cwd" = "$root" ]; then',
		"    printf '.'",
		`  elif [ "${SHELL_RELATIVE_CWD}" != "$cwd" ]; then`,
		`    printf '%s' "${SHELL_RELATIVE_CWD}"`,
		"  fi",
		"}",
		"__bodhi_terminal_session() {",
		'  if [ -n "$TERM_SESSION_ID" ]; then',
		"    printf '%s' \"$TERM_SESSION_ID\"",
		'  elif [ -n "$TMUX_PANE" ]; then',
		"    printf 'tmux:%s' \"$TMUX_PANE\"",
		"  else",
		"    tty_path=$(tty 2>/dev/null || true)",
		'    if [ -n "$tty_path" ] && [ "$tty_path" != "not a tty" ]; then',
		"      printf '%s' \"$tty_path\"",
		"    else",
		"      printf 'pid:%s' \"$$\"",
		"    fi",
		"  fi",
		"}",
		"__bodhi_git_branch() {",
		"  git symbolic-ref --quiet --short HEAD 2>/dev/null || true",
		"}",
		"__bodhi_git_branch_for_sha() {",
		'  sha="$1"',
		"  branches=$(git for-each-ref --format='%(refname:short)' --points-at \"$sha\" refs/heads 2>/dev/null || true)",
		'  [ -n "$branches" ] || return 0',
		"  set -- $branches",
		'  [ "$#" -eq 1 ] || return 0',
		"  printf '%s' \"$1\"",
		"}",
		"__bodhi_git_parent_count() {",
		"  set -- $(git rev-list --parents -n 1 HEAD 2>/dev/null || true)",
		'  [ "$#" -gt 0 ] || { printf "0"; return 0; }',
		"  printf '%s' $(($# - 1))",
		"}",
		"__bodhi_context_json() {",
		'  tool="$1"',
		'  normalized_cwd=$(__bodhi_normalize_dir "$PWD" 2>/dev/null || printf "%s" "$PWD")',
		"  terminal_session=$(__bodhi_terminal_session)",
		'  repo_id=""',
		'  worktree_root=""',
		'  branch=""',
		'  head_sha=""',
		'  git_state=""',
		'  relative_cwd=""',
		"  common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || git rev-parse --git-common-dir 2>/dev/null || true)",
		"  git_dir=$(git rev-parse --path-format=absolute --git-dir 2>/dev/null || git rev-parse --git-dir 2>/dev/null || true)",
		"  worktree_root=$(git rev-parse --path-format=absolute --show-toplevel 2>/dev/null || git rev-parse --show-toplevel 2>/dev/null || true)",
		`  if [ -n "$common_dir" ] && [ "${SHELL_COMMON_DIR_ABSOLUTE}" = "$common_dir" ]; then`,
		'    common_dir=$(__bodhi_normalize_dir "$PWD/$common_dir" 2>/dev/null || printf "%s" "$PWD/$common_dir")',
		"  fi",
		`  if [ -n "$git_dir" ] && [ "${SHELL_GIT_DIR_ABSOLUTE}" = "$git_dir" ]; then`,
		'    git_dir=$(__bodhi_normalize_dir "$PWD/$git_dir" 2>/dev/null || printf "%s" "$PWD/$git_dir")',
		"  fi",
		'  if [ -n "$worktree_root" ]; then',
		'    worktree_root=$(__bodhi_normalize_dir "$worktree_root" 2>/dev/null || printf "%s" "$worktree_root")',
		"  fi",
		'  if [ -n "$common_dir" ]; then',
		'    repo_id=$(__bodhi_normalize_dir "$common_dir" 2>/dev/null || printf "%s" "$common_dir")',
		"  fi",
		"  branch=$(__bodhi_git_branch)",
		"  head_sha=$(git rev-parse HEAD 2>/dev/null || true)",
		'  if [ -n "$git_dir" ]; then',
		'    git_state=$(__bodhi_git_state "$git_dir" "$branch")',
		"  fi",
		'  if [ -n "$worktree_root" ]; then',
		'    relative_cwd=$(__bodhi_relative_cwd "$worktree_root" "$normalized_cwd")',
		"  fi",
		"  if command -v jq >/dev/null 2>&1; then",
		"    jq -c -n \\",
		'      --arg repo_id "$repo_id" \\',
		'      --arg worktree_root "$worktree_root" \\',
		'      --arg branch "$branch" \\',
		'      --arg head_sha "$head_sha" \\',
		'      --arg git_state "$git_state" \\',
		'      --arg cwd "$normalized_cwd" \\',
		'      --arg relative_cwd "$relative_cwd" \\',
		'      --arg terminal_session "$terminal_session" \\',
		'      --arg tool "$tool" \\',
		"      'reduce [",
		'        {key:"repo_id",value:$repo_id},',
		'        {key:"worktree_root",value:$worktree_root},',
		'        {key:"branch",value:$branch},',
		'        {key:"head_sha",value:$head_sha},',
		'        {key:"git_state",value:$git_state},',
		'        {key:"cwd",value:$cwd},',
		'        {key:"relative_cwd",value:$relative_cwd},',
		'        {key:"terminal_session",value:$terminal_session},',
		'        {key:"tool",value:$tool}',
		"      ][] as $entry ({}; if ($entry.value | length) > 0 then . + {($entry.key): $entry.value} else . end)'",
		"    return",
		"  fi",
		"  if command -v python3 >/dev/null 2>&1; then",
		'    python3 - "$repo_id" "$worktree_root" "$branch" "$head_sha" "$git_state" "$normalized_cwd" "$relative_cwd" "$terminal_session" "$tool" <<\'PY\'',
		"import json, sys",
		"keys = [",
		'    "repo_id",',
		'    "worktree_root",',
		'    "branch",',
		'    "head_sha",',
		'    "git_state",',
		'    "cwd",',
		'    "relative_cwd",',
		'    "terminal_session",',
		'    "tool",',
		"]",
		"payload = {}",
		"for key, value in zip(keys, sys.argv[1:]):",
		"    if value:",
		"        payload[key] = value",
		"print(json.dumps(payload))",
		"PY",
		"    return",
		"  fi",
		"  printf '{}'",
		"}",
		"__bodhi_event_id() {",
		'  uuidgen 2>/dev/null || printf "%s-%s-%s" "$(date +%s)" "$$" "$RANDOM"',
		"}",
		"__bodhi_emit_event() {",
		'  event_type="$1"',
		'  metadata_json="$2"',
		'  context_json="$3"',
		'  [ -n "$context_json" ] || context_json="{}"',
		"  event_id=$(__bodhi_event_id)",
		'  payload=""',
		"  if command -v jq >/dev/null 2>&1; then",
		"    payload=$(jq -c -n \\",
		'      --arg event_id "$event_id" \\',
		'      --arg event_type "$event_type" \\',
		'      --argjson metadata "$metadata_json" \\',
		'      --argjson context "$context_json" \\',
		"      '{event_id:$event_id,type:$event_type,metadata:$metadata} + (if ($context | length) > 0 then {context:$context} else {} end)')",
		"  elif command -v python3 >/dev/null 2>&1; then",
		'    payload=$(python3 - "$event_id" "$event_type" "$metadata_json" "$context_json" <<\'PY\'',
		"import json, sys",
		'payload = {"event_id": sys.argv[1], "type": sys.argv[2], "metadata": json.loads(sys.argv[3])}',
		"context = json.loads(sys.argv[4])",
		"if context:",
		'    payload["context"] = context',
		"print(json.dumps(payload))",
		"PY",
		"    )",
		"  fi",
		'  [ -n "$payload" ] || return 0',
		'  if ! curl -s --max-time 0.2 --unix-socket "$__bodhi_sock" \\',
		"    -X POST http://localhost/events \\",
		"    -H 'Content-Type: application/json' \\",
		'    -d "$payload" >/dev/null 2>&1; then',
		'    printf "%s\n" "$payload" >> "$__bodhi_spool" 2>/dev/null',
		"  fi",
		"}",
	].join("\n");
}

function buildCommitHookMain(): string {
	return [
		"commit_sha=$(git rev-parse HEAD 2>/dev/null || true)",
		'[ -n "$commit_sha" ] || exit 0',
		"commit_message=$(git log -1 --pretty=%B HEAD 2>/dev/null || true)",
		"parent_count=$(__bodhi_git_parent_count)",
		"files_changed=0",
		"insertions=0",
		"deletions=0",
		"files_text=''",
		"while IFS=$(printf '\\t') read -r added deleted path; do",
		'  [ -n "$path" ] || continue',
		"  files_changed=$((files_changed + 1))",
		'  case "$added" in',
		"    ''|-) ;;",
		"    *) insertions=$((insertions + added)) ;;",
		"  esac",
		'  case "$deleted" in',
		"    ''|-) ;;",
		"    *) deletions=$((deletions + deleted)) ;;",
		"  esac",
		`  files_text="${SHELL_FILES_APPEND}"`,
		"done <<EOF",
		"$(git show --format= --numstat --no-renames HEAD 2>/dev/null || true)",
		"EOF",
		"if command -v jq >/dev/null 2>&1; then",
		"  metadata_json=$(printf '%s' \"$files_text\" | jq -Rsc \\",
		'    --arg hash "$commit_sha" \\',
		'    --arg message "$commit_message" \\',
		'    --argjson parent_count "$parent_count" \\',
		'    --argjson files_changed "$files_changed" \\',
		'    --argjson insertions "$insertions" \\',
		'    --argjson deletions "$deletions" \\',
		"    '{hash:$hash,message:$message,parent_count:$parent_count,files_changed:$files_changed,files:(split(\"\\n\")|map(select(length>0))),insertions:$insertions,deletions:$deletions}')",
		"elif command -v python3 >/dev/null 2>&1; then",
		'  metadata_json=$(python3 - "$commit_sha" "$commit_message" "$parent_count" "$files_changed" "$insertions" "$deletions" "$files_text" <<\'PY\'',
		"import json, sys",
		"files = [line for line in sys.argv[7].splitlines() if line]",
		"print(json.dumps({",
		'    "hash": sys.argv[1],',
		'    "message": sys.argv[2],',
		'    "parent_count": int(sys.argv[3]),',
		'    "files_changed": int(sys.argv[4]),',
		'    "files": files,',
		'    "insertions": int(sys.argv[5]),',
		'    "deletions": int(sys.argv[6]),',
		"}))",
		"PY",
		"  )",
		"else",
		"  exit 0",
		"fi",
		'context_json=$(__bodhi_context_json "git.hook")',
		'__bodhi_emit_event "git.commit.created" "$metadata_json" "$context_json"',
	].join("\n");
}

function buildCheckoutHookMain(): string {
	return [
		`from_sha="${SHELL_ARG_1}"`,
		`to_sha="${SHELL_ARG_2}"`,
		`checkout_flag="${SHELL_ARG_3}"`,
		"current_branch=$(__bodhi_git_branch)",
		'from_branch=$(__bodhi_git_branch_for_sha "$from_sha")',
		'to_branch=""',
		'checkout_kind="branch-switch"',
		'if [ "$checkout_flag" = "0" ]; then',
		'  checkout_kind="file-checkout"',
		`elif [ "$from_sha" = "${ZERO_SHA}" ]; then`,
		'  checkout_kind="initial-clone"',
		'  to_branch="$current_branch"',
		'elif [ -z "$current_branch" ]; then',
		'  checkout_kind="detached-head"',
		"else",
		'  to_branch="$current_branch"',
		"fi",
		"if command -v jq >/dev/null 2>&1; then",
		"  metadata_json=$(jq -c -n \\",
		'    --arg from_sha "$from_sha" \\',
		'    --arg to_sha "$to_sha" \\',
		'    --arg from_branch "$from_branch" \\',
		'    --arg to_branch "$to_branch" \\',
		'    --arg checkout_kind "$checkout_kind" \\',
		"    'reduce [",
		'      {key:"checkout_kind",value:$checkout_kind},',
		'      {key:"from_sha",value:$from_sha},',
		'      {key:"to_sha",value:$to_sha},',
		'      {key:"from_branch",value:$from_branch},',
		'      {key:"to_branch",value:$to_branch}',
		"    ][] as $entry ({}; if ($entry.value | length) > 0 then . + {($entry.key): $entry.value} else . end)' )",
		"elif command -v python3 >/dev/null 2>&1; then",
		'  metadata_json=$(python3 - "$from_sha" "$to_sha" "$from_branch" "$to_branch" "$checkout_kind" <<\'PY\'',
		"import json, sys",
		'payload = {"checkout_kind": sys.argv[5]}',
		"if sys.argv[1]:",
		'    payload["from_sha"] = sys.argv[1]',
		"if sys.argv[2]:",
		'    payload["to_sha"] = sys.argv[2]',
		"if sys.argv[3]:",
		'    payload["from_branch"] = sys.argv[3]',
		"if sys.argv[4]:",
		'    payload["to_branch"] = sys.argv[4]',
		"print(json.dumps(payload))",
		"PY",
		"  )",
		"else",
		"  exit 0",
		"fi",
		'context_json=$(__bodhi_context_json "git.hook")',
		'__bodhi_emit_event "git.checkout" "$metadata_json" "$context_json"',
	].join("\n");
}

function buildMergeHookMain(): string {
	return [
		`is_squash_flag="${SHELL_ARG_1_ZERO}"`,
		'is_squash_json="false"',
		'[ "$is_squash_flag" = "1" ] && is_squash_json="true"',
		"merge_commit_sha=$(git rev-parse HEAD 2>/dev/null || true)",
		'[ -n "$merge_commit_sha" ] || exit 0',
		"parent_count=$(__bodhi_git_parent_count)",
		"if command -v jq >/dev/null 2>&1; then",
		"  metadata_json=$(jq -c -n \\",
		'    --arg merge_commit_sha "$merge_commit_sha" \\',
		'    --argjson parent_count "$parent_count" \\',
		'    --argjson is_squash "$is_squash_json" \\',
		"    '{merge_commit_sha:$merge_commit_sha,parent_count:$parent_count,is_squash:$is_squash}' )",
		"elif command -v python3 >/dev/null 2>&1; then",
		'  metadata_json=$(python3 - "$merge_commit_sha" "$parent_count" "$is_squash_flag" <<\'PY\'',
		"import json, sys",
		"print(json.dumps({",
		'    "merge_commit_sha": sys.argv[1],',
		'    "parent_count": int(sys.argv[2]),',
		'    "is_squash": sys.argv[3] == "1",',
		"}))",
		"PY",
		"  )",
		"else",
		"  exit 0",
		"fi",
		'context_json=$(__bodhi_context_json "git.hook")',
		'__bodhi_emit_event "git.merge" "$metadata_json" "$context_json"',
	].join("\n");
}

function buildRewriteHookMain(): string {
	return [
		`rewrite_type="${SHELL_ARG_1}"`,
		'case "$rewrite_type" in',
		"  amend|rebase) ;;",
		"  *) exit 0 ;;",
		"esac",
		"mappings_text=$(cat)",
		'[ -n "$mappings_text" ] || exit 0',
		'rewritten_count=$(printf "%s\n" "$mappings_text" | awk \'NF {count += 1} END {print count + 0}\')',
		"if command -v jq >/dev/null 2>&1; then",
		"  metadata_json=$(printf '%s\n' \"$mappings_text\" | jq -Rsc \\",
		'    --arg rewrite_type "$rewrite_type" \\',
		'    --argjson rewritten_commit_count "$rewritten_count" \\',
		'    \'{rewrite_type:$rewrite_type,rewritten_commit_count:$rewritten_commit_count,mappings:[split("\\n")[] | select(length>0) | capture("^(?<from_hash>[^[:space:]]+)\\\\s+(?<to_hash>[^[:space:]]+)$")]}\' )',
		"elif command -v python3 >/dev/null 2>&1; then",
		'  metadata_json=$(python3 - "$rewrite_type" "$rewritten_count" "$mappings_text" <<\'PY\'',
		"import json, sys",
		"mappings = []",
		"for line in sys.argv[3].splitlines():",
		"    if not line.strip():",
		"        continue",
		"    parts = line.split()",
		"    if len(parts) < 2:",
		"        continue",
		'    mappings.append({"from_hash": parts[0], "to_hash": parts[1]})',
		"print(json.dumps({",
		'    "rewrite_type": sys.argv[1],',
		'    "rewritten_commit_count": int(sys.argv[2]),',
		'    "mappings": mappings,',
		"}))",
		"PY",
		"  )",
		"else",
		"  exit 0",
		"fi",
		'context_json=$(__bodhi_context_json "git.hook")',
		'__bodhi_emit_event "git.rewrite" "$metadata_json" "$context_json"',
	].join("\n");
}

export function buildGitHookBlock(hookName: SupportedGitHook, options: GitHookOptions): string {
	const main =
		hookName === "post-commit"
			? buildCommitHookMain()
			: hookName === "post-checkout"
				? buildCheckoutHookMain()
				: hookName === "post-merge"
					? buildMergeHookMain()
					: buildRewriteHookMain();

	return [HOOK_START, buildGitHelpers(options), main, HOOK_END].join("\n");
}

function nextHookContents(existing: string, block: string): string {
	const stripped = stripGitHookBlock(existing).replace(/\s*$/, "");
	const base = stripped.length > 0 ? stripped : "#!/bin/sh";
	return `${base}${base.endsWith("\n") ? "" : "\n"}\n${block}\n`;
}

export function installGitHooks(options: InstallGitHooksOptions): GitHookInstallResult {
	if (!runGit(options.cwd, ["--version"])) {
		return {
			changedHooks: [],
			skippedReason: "git-not-found",
		};
	}

	const target = resolveGitHookTarget(options.cwd);
	if (!target) {
		return {
			changedHooks: [],
			skippedReason: "not-a-git-repo",
		};
	}

	mkdirSync(options.dataDir, { recursive: true });
	mkdirSync(target.hooksDir, { recursive: true });
	const changedHooks: SupportedGitHook[] = [];
	for (const hookName of HOOK_NAMES) {
		const hookPath = join(target.hooksDir, hookName);
		const existing = existsSync(hookPath) ? readFileSync(hookPath, "utf8") : "";
		const block = buildGitHookBlock(hookName, options);
		const next = nextHookContents(existing, block);
		if (existing !== next) {
			writeFileSync(hookPath, next, "utf8");
			changedHooks.push(hookName);
		}
		chmodSync(hookPath, 0o755);
	}

	return {
		changedHooks,
		hooksDir: target.hooksDir,
		repoRoot: target.repoRoot,
	};
}

export function uninstallGitHooks(cwd: string): GitHookInstallResult {
	const target = resolveGitHookTarget(cwd);
	if (!target) {
		return {
			changedHooks: [],
			skippedReason: "not-a-git-repo",
		};
	}

	const changedHooks: SupportedGitHook[] = [];
	for (const hookName of HOOK_NAMES) {
		const hookPath = join(target.hooksDir, hookName);
		if (!existsSync(hookPath)) {
			continue;
		}
		const existing = readFileSync(hookPath, "utf8");
		const next = stripGitHookBlock(existing)
			.replace(/\n{3,}/g, "\n\n")
			.replace(/\s*$/, "\n");
		if (existing !== next) {
			writeFileSync(hookPath, next, "utf8");
			changedHooks.push(hookName);
		}
	}

	return {
		changedHooks,
		hooksDir: target.hooksDir,
		repoRoot: target.repoRoot,
	};
}

export function hasGitHook(contents: string): boolean {
	return contents.includes(HOOK_START) && contents.includes(HOOK_END);
}
