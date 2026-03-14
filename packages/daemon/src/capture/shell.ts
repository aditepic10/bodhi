import { accessSync, constants, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HOOK_START = "# >>> bodhi >>>";
const HOOK_END = "# <<< bodhi <<<";
const SHELL_COMMAND_SNIPPET = "$" + "{__bodhi_cmd:0:1024}";
const SHELL_DURATION_SNIPPET = "$" + "{duration%.*}";
const PROMPT_COMMAND_APPEND_SNIPPET = "$" + "{PROMPT_COMMAND:+;$PROMPT_COMMAND}";

export type SupportedShell = "bash" | "zsh";

export interface ShellHookOptions {
	dataDir: string;
	socketPath: string;
}

export interface ShellDependencyStatus {
	jq: boolean;
	python3: boolean;
	uuidgen: boolean;
}

export interface FirstRunStatus {
	configExists: boolean;
	dataDirExists: boolean;
	dependencies: ShellDependencyStatus;
	hooksInstalled: Partial<Record<SupportedShell, boolean>>;
}

export interface InstallShellHookOptions extends ShellHookOptions {
	rcPath: string;
	shell: SupportedShell;
}

function shellSingleQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function buildJsonPayloadFunction(): string {
	return [
		"__bodhi_payload() {",
		"  if command -v jq >/dev/null 2>&1; then",
		"    jq -c -n \\",
		'      --arg eid "$1" \\',
		'      --arg cmd "$2" \\',
		'      --argjson exit "$3" \\',
		'      --argjson dur "$4" \\',
		'      --arg cwd "$5" \\',
		'      --arg ctx "$6" \\',
		"      '{event_id:$eid,type:\"shell.command.executed\",metadata:{command:$cmd,exit_code:$exit,duration_ms:$dur,cwd:$cwd}} + (if ($ctx | length) > 0 then {context: ($ctx | fromjson)} else {} end)'",
		"    return",
		"  fi",
		"  if command -v python3 >/dev/null 2>&1; then",
		'    python3 - "$1" "$2" "$3" "$4" "$5" "$6" <<\'PY\'',
		"import json, sys",
		"payload = {",
		'    "event_id": sys.argv[1],',
		'    "type": "shell.command.executed",',
		'    "metadata": {',
		'        "command": sys.argv[2],',
		'        "exit_code": int(sys.argv[3]),',
		'        "duration_ms": int(sys.argv[4]),',
		'        "cwd": sys.argv[5],',
		"    },",
		"}",
		"if len(sys.argv) > 6 and sys.argv[6]:",
		'    payload["context"] = json.loads(sys.argv[6])',
		"print(json.dumps(payload))",
		"PY",
		"    return",
		"  fi",
		"  return 1",
		"}",
	].join("\n");
}

function buildContextFunctions(): string {
	return [
		"__bodhi_normalize_dir() {",
		'  local target="$1"',
		'  [[ -z "$target" ]] && return 1',
		'  [[ -d "$target" ]] || return 1',
		'  (cd "$target" 2>/dev/null && pwd -P) || return 1',
		"}",
		"__bodhi_git_state() {",
		'  local git_dir="$1"',
		'  local branch="$2"',
		'  local state="normal"',
		'  if [[ -d "$git_dir/rebase-merge" || -d "$git_dir/rebase-apply" ]]; then',
		'    state="rebasing"',
		'  elif [[ -f "$git_dir/MERGE_HEAD" ]]; then',
		'    state="merging"',
		'  elif [[ -f "$git_dir/CHERRY_PICK_HEAD" ]]; then',
		'    state="cherry-picking"',
		'  elif [[ -f "$git_dir/REVERT_HEAD" ]]; then',
		'    state="reverting"',
		'  elif [[ -f "$git_dir/BISECT_LOG" ]]; then',
		'    state="bisecting"',
		'  elif [[ -z "$branch" ]]; then',
		'    state="detached"',
		"  fi",
		"  printf '%s' \"$state\"",
		"}",
		"__bodhi_relative_cwd() {",
		'  local root="$1"',
		'  local cwd="$2"',
		'  [[ -z "$root" || -z "$cwd" ]] && return 0',
		'  if [[ "$cwd" == "$root" ]]; then',
		"    printf '.'",
		'  elif [[ "$cwd" == "$root/"* ]]; then',
		"    printf '%s' \"$" + '{cwd#"$root"/}"',
		"  fi",
		"}",
		"__bodhi_terminal_session() {",
		'  if [[ -n "$TERM_SESSION_ID" ]]; then',
		"    printf '%s' \"$TERM_SESSION_ID\"",
		'  elif [[ -n "$TMUX_PANE" ]]; then',
		"    printf 'tmux:%s' \"$TMUX_PANE\"",
		"  else",
		"    local tty_path",
		"    tty_path=$(tty 2>/dev/null)",
		'    if [[ -n "$tty_path" && "$tty_path" != "not a tty" ]]; then',
		"      printf '%s' \"$tty_path\"",
		"    else",
		"      printf 'pid:%s' \"$$\"",
		"    fi",
		"  fi",
		"}",
		"__bodhi_context_json() {",
		'  local cwd="$1"',
		'  local tool="$2"',
		"  local normalized_cwd",
		'  normalized_cwd=$(__bodhi_normalize_dir "$cwd" 2>/dev/null || printf \'%s\' "$cwd")',
		"  local terminal_session",
		"  terminal_session=$(__bodhi_terminal_session)",
		'  local repo_id=""',
		'  local worktree_root=""',
		'  local branch=""',
		'  local head_sha=""',
		'  local git_state=""',
		'  local relative_cwd=""',
		"  if command -v git >/dev/null 2>&1; then",
		"    local common_dir",
		"    local git_dir",
		'    common_dir=$(git -C "$normalized_cwd" rev-parse --git-common-dir 2>/dev/null || true)',
		'    git_dir=$(git -C "$normalized_cwd" rev-parse --git-dir 2>/dev/null || true)',
		'    worktree_root=$(git -C "$normalized_cwd" rev-parse --show-toplevel 2>/dev/null || true)',
		'    if [[ -n "$worktree_root" ]]; then',
		'      worktree_root=$(__bodhi_normalize_dir "$worktree_root" 2>/dev/null || printf \'%s\' "$worktree_root")',
		"    fi",
		'    if [[ -n "$common_dir" ]]; then',
		'      if [[ "$common_dir" = /* ]]; then',
		'        repo_id=$(__bodhi_normalize_dir "$common_dir" 2>/dev/null || printf \'%s\' "$common_dir")',
		'      elif [[ -n "$normalized_cwd" ]]; then',
		'        repo_id=$(__bodhi_normalize_dir "$normalized_cwd/$common_dir" 2>/dev/null || printf \'%s\' "$normalized_cwd/$common_dir")',
		"      fi",
		"    fi",
		'    if [[ -n "$git_dir" ]]; then',
		'      if [[ "$git_dir" = /* ]]; then',
		'        git_dir=$(__bodhi_normalize_dir "$git_dir" 2>/dev/null || printf \'%s\' "$git_dir")',
		'      elif [[ -n "$normalized_cwd" ]]; then',
		'        git_dir=$(__bodhi_normalize_dir "$normalized_cwd/$git_dir" 2>/dev/null || printf \'%s\' "$normalized_cwd/$git_dir")',
		"      fi",
		"    fi",
		'    branch=$(git -C "$normalized_cwd" symbolic-ref --short HEAD 2>/dev/null || true)',
		'    head_sha=$(git -C "$normalized_cwd" rev-parse --short=8 HEAD 2>/dev/null || true)',
		'    if [[ -n "$git_dir" ]]; then',
		'      git_state=$(__bodhi_git_state "$git_dir" "$branch")',
		"    fi",
		'    if [[ -n "$worktree_root" ]]; then',
		'      relative_cwd=$(__bodhi_relative_cwd "$worktree_root" "$normalized_cwd")',
		"    fi",
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
		"  return 1",
		"}",
	].join("\n");
}

export function buildZshHookBlock(options: ShellHookOptions): string {
	return [
		HOOK_START,
		"autoload -Uz add-zsh-hook",
		`__bodhi_sock=${shellSingleQuote(options.socketPath)}`,
		`__bodhi_spool=${shellSingleQuote(join(options.dataDir, "spool.$$.jsonl"))}`,
		buildContextFunctions(),
		buildJsonPayloadFunction(),
		"__bodhi_preexec() {",
		'  __bodhi_cmd="$1"',
		"  __bodhi_start=$EPOCHREALTIME",
		"}",
		"__bodhi_precmd() {",
		"  local exit_code=$?",
		'  [[ -z "$__bodhi_cmd" ]] && return',
		"  local duration=$(( (EPOCHREALTIME - __bodhi_start) * 1000 ))",
		"  local eid",
		'  eid=$(uuidgen 2>/dev/null) || eid="$(date +%s)-$$-$RANDOM"',
		"  local payload",
		"  local context",
		`  context=$(__bodhi_context_json "$PWD" "shell.zsh" 2>/dev/null || true)`,
		`  payload=$(__bodhi_payload "$eid" "${SHELL_COMMAND_SNIPPET}" "$exit_code" "${SHELL_DURATION_SNIPPET}" "$PWD" "$context") || { unset __bodhi_cmd; return; }`,
		'  if ! curl -s --max-time 0.1 --unix-socket "$__bodhi_sock" \\',
		"    -X POST http://localhost/events \\",
		"    -H 'Content-Type: application/json' \\",
		'    -d "$payload" >/dev/null 2>&1; then',
		`    printf '%s\n' "$payload" >> "$__bodhi_spool" 2>/dev/null`,
		"  fi",
		"  unset __bodhi_cmd",
		"}",
		"add-zsh-hook preexec __bodhi_preexec",
		"add-zsh-hook precmd __bodhi_precmd",
		HOOK_END,
	].join("\n");
}

export function buildBashHookBlock(options: ShellHookOptions): string {
	return [
		HOOK_START,
		`__bodhi_sock=${shellSingleQuote(options.socketPath)}`,
		`__bodhi_spool=${shellSingleQuote(join(options.dataDir, "spool.$$.jsonl"))}`,
		buildContextFunctions(),
		buildJsonPayloadFunction(),
		"__bodhi_command_started=0",
		"__bodhi_preexec() {",
		'  if [[ -n "$BASH_COMMAND" && "$BASH_COMMAND" != __bodhi_precmd* ]]; then',
		'    __bodhi_cmd="$BASH_COMMAND"',
		"    __bodhi_start=$(python3 - <<'PY'\nimport time\nprint(time.time())\nPY\n)",
		"    __bodhi_command_started=1",
		"  fi",
		"}",
		"__bodhi_precmd() {",
		"  local exit_code=$?",
		'  [[ "$__bodhi_command_started" -eq 0 ]] && return',
		"  local now",
		"  now=$(python3 - <<'PY'\nimport time\nprint(time.time())\nPY\n)",
		"  local duration",
		`  duration=$(python3 - "$__bodhi_start" "$now" <<'PY'
import sys
print(int((float(sys.argv[2]) - float(sys.argv[1])) * 1000))
PY
)`,
		"  local eid",
		'  eid=$(uuidgen 2>/dev/null) || eid="$(date +%s)-$$-$RANDOM"',
		"  local payload",
		"  local context",
		`  context=$(__bodhi_context_json "$PWD" "shell.bash" 2>/dev/null || true)`,
		`  payload=$(__bodhi_payload "$eid" "${SHELL_COMMAND_SNIPPET}" "$exit_code" "$duration" "$PWD" "$context") || { __bodhi_command_started=0; unset __bodhi_cmd; return; }`,
		'  if ! curl -s --max-time 0.1 --unix-socket "$__bodhi_sock" \\',
		"    -X POST http://localhost/events \\",
		"    -H 'Content-Type: application/json' \\",
		'    -d "$payload" >/dev/null 2>&1; then',
		`    printf '%s\n' "$payload" >> "$__bodhi_spool" 2>/dev/null`,
		"  fi",
		"  __bodhi_command_started=0",
		"  unset __bodhi_cmd",
		"}",
		"trap '__bodhi_preexec' DEBUG",
		'case ";$PROMPT_COMMAND;" in',
		'  *";__bodhi_precmd;"*) ;;',
		`  *) PROMPT_COMMAND="__bodhi_precmd${PROMPT_COMMAND_APPEND_SNIPPET}" ;;`,
		"esac",
		HOOK_END,
	].join("\n");
}

export function stripShellHookBlock(contents: string): string {
	const blockPattern = new RegExp(`\\n?${HOOK_START}[\\s\\S]*?${HOOK_END}\\n?`, "g");
	return contents.replace(blockPattern, (_match, offset) => {
		if (offset === 0) {
			return "";
		}
		return "\n";
	});
}

export function installShellHook(options: InstallShellHookOptions): {
	changed: boolean;
	contents: string;
} {
	const existing = existsSync(options.rcPath) ? readFileSync(options.rcPath, "utf8") : "";
	const withoutOldBlock = stripShellHookBlock(existing).replace(/\s*$/, "");
	const block = options.shell === "zsh" ? buildZshHookBlock(options) : buildBashHookBlock(options);
	const next = `${withoutOldBlock}${withoutOldBlock.length > 0 ? "\n\n" : ""}${block}\n`;

	writeFileSync(options.rcPath, next, "utf8");
	return {
		changed: existing !== next,
		contents: next,
	};
}

export function uninstallShellHook(rcPath: string): { changed: boolean; contents: string } {
	const existing = existsSync(rcPath) ? readFileSync(rcPath, "utf8") : "";
	const next = stripShellHookBlock(existing)
		.replace(/\n{3,}/g, "\n\n")
		.replace(/\s*$/, "\n");
	if (existing !== next) {
		writeFileSync(rcPath, next, "utf8");
	}
	return {
		changed: existing !== next,
		contents: next,
	};
}

export function hasShellHook(contents: string): boolean {
	return contents.includes(HOOK_START) && contents.includes(HOOK_END);
}

export function detectShellDependencies(
	commandExists: (command: string) => boolean = defaultCommandExists,
): ShellDependencyStatus {
	return {
		jq: commandExists("jq"),
		python3: commandExists("python3"),
		uuidgen: commandExists("uuidgen"),
	};
}

function defaultCommandExists(command: string): boolean {
	const path = process.env.PATH ?? "";
	for (const segment of path.split(":")) {
		if (!segment) {
			continue;
		}

		try {
			accessSync(join(segment, command), constants.X_OK);
			return true;
		} catch {}
	}

	return false;
}

export function detectFirstRunStatus(options: {
	configPath: string;
	dataDir: string;
	rcFiles: Partial<Record<SupportedShell, string>>;
	commandExists?: (command: string) => boolean;
}): FirstRunStatus {
	const dependencies = detectShellDependencies(options.commandExists);
	return {
		configExists: existsSync(options.configPath),
		dataDirExists: existsSync(options.dataDir),
		dependencies,
		hooksInstalled: {
			bash: options.rcFiles.bash ? readHookFlag(options.rcFiles.bash) : false,
			zsh: options.rcFiles.zsh ? readHookFlag(options.rcFiles.zsh) : false,
		},
	};
}

function readHookFlag(path: string): boolean {
	if (!existsSync(path)) {
		return false;
	}

	return hasShellHook(readFileSync(path, "utf8"));
}

export function renderFirstRunGuidance(status: FirstRunStatus): string {
	const lines = ["Bodhi first-run status:"];
	lines.push(`- config: ${status.configExists ? "present" : "missing"}`);
	lines.push(`- data dir: ${status.dataDirExists ? "present" : "missing"}`);
	lines.push(`- zsh hook: ${status.hooksInstalled.zsh ? "installed" : "missing"}`);
	lines.push(`- bash hook: ${status.hooksInstalled.bash ? "installed" : "missing"}`);
	lines.push(`- jq: ${status.dependencies.jq ? "found" : "missing"}`);
	lines.push(`- uuidgen: ${status.dependencies.uuidgen ? "found" : "missing"}`);
	lines.push(`- python3 fallback: ${status.dependencies.python3 ? "found" : "missing"}`);
	if (!status.dependencies.jq && !status.dependencies.python3) {
		lines.push("- install jq or python3 before enabling shell capture");
	}
	if (!status.configExists) {
		lines.push("- run `bodhi init` to create config and install hooks");
	}
	return lines.join("\n");
}

export function defaultRcPath(shell: SupportedShell, homeDir = process.env.HOME ?? ""): string {
	return join(homeDir, shell === "zsh" ? ".zshrc" : ".bashrc");
}

export function defaultConfigPath(homeDir = process.env.HOME ?? ""): string {
	return join(homeDir, ".config", "bodhi", "config.toml");
}
