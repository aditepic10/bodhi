# Bodhi Full Use-Case Catalog

This file contains the full imported use-case catalog from the architecture planning work. It is the detailed product and extensibility reference behind the shorter [USE_CASES.md](../../USE_CASES.md) summary.

## Round 1: 42 Use Cases

These were the original extensibility stress tests used against the early architecture.

### A. Terminal and Shell Productivity

1. Command recall
   "What was that command I ran last Tuesday to fix the Docker build?"
   Shell hooks capture every command with timestamps. FTS5 plus temporal filtering finds it instantly.
   Core demo use case. Shell hooks to events table to FTS5 search with time-range filter.

2. Contextual command suggestions
   "You usually run `make test` after `git pull` in this repo."
   Detects sequential command patterns and suggests next actions.
   Requires batch analytics to mine sequential patterns from event history. Not real-time. Needs cold-path pattern detection.

3. Per-directory environment awareness
   "In this repo you always need `nvm use 18` first."
   Learns per-project setup requirements from repeated commands.
   Shell hooks capture `cwd`. Agent extracts facts like "repo X requires node 18." Facts queried when user enters a directory.

4. Shell error diagnosis
   "That segfault you hit 3 times this week in project X. Here is what changed."
   Correlates recurring errors with code and system changes.
   Needs cross-event correlation: match exit codes across time, correlate with git diffs and system changes. Requires typed event payloads with structured error fields.

5. Dotfile version tracking
   "Your `.zshrc` changed 4 times this month. Here is the diff timeline."
   Passive monitoring of config file changes.
   Not supported passively. Needs a file-system watcher capture source on designated config files.

### B. Git and Code Workflow

6. Weekly work summary
   "Summarize what I worked on this week across all repos."
   Aggregates git commits, branches, and shell activity by time range.
   Git events plus command events plus temporal aggregation. Agent synthesizes a summary.

7. Commit archaeology
   "What was the context behind this commit from 3 months ago?"
   Reconstructs the story: the bug, the discussion, the alternatives tried.
   Bi-temporal facts link to commit events. If the agent extracted context at commit time, those facts are retrievable months later.

8. PR review assistant
   "Based on my review style and this repo's conventions, here is my review."
   Generates PR reviews matching established patterns.
   Needs PR diff ingestion and stored convention facts. Requires a GitHub capture source with webhook or polling.

9. Branch context resurrection
   "I was working on `feature-auth-v2` three weeks ago, got pulled into an incident. Where did I leave off?"
   Reconstructs full branch context.
   Git events plus command events plus conversation history create a timeline. A `resume_context` tool queries recent events filtered by branch and repo.

10. Cross-repo dependency tracking
    "Last time you upgraded React in repo A, you also had to update repo B."
    Connects dependency changes across repositories.
    Events from multiple repos share one DB. Correlating dependency changes requires parsing dependency diffs and building a dependency graph. Needs structured dependency event types.

### C. Learning and Knowledge Management

11. Technology learning tracking
    "What new technologies or tools have I learned in the last 6 months?"
    Fact categorization plus temporal queries show learning trajectory.
    Facts tagged with categories like `technology`. Query by category plus time range.

12. Spaced repetition
    "Remind me about that Rust lifetime trick I learned 2 weeks ago."
    Surfaces facts at increasing intervals for retention.
    Facts store the knowledge, but spaced repetition needs a scheduler that proactively surfaces facts. The daemon is passive today.

13. Reading list tracking
    "Save this URL, summarize it, remind me later."
    Captures URLs, fetches content, stores summaries.
    Can store URLs as facts, but summarization requires HTTP fetching. Needs an HTTP client tool or capture source.

14. Personal knowledge graph
    "How does concept X relate to concept Y in my notes?"
    Queryable graph of everything learned, connected by relationships.
    Facts are currently flat rows with FTS5. Needs `fact_links` usage plus vector embeddings for semantic relatedness.

### D. Health and Wellness

15. Work hours tracking
    "How many hours did I code this week? When did I stop?"
    Infers work sessions from command timestamp gaps.
    Shell hooks with timestamps allow rough session duration via gaps between commands.

16. Break reminders
    "You have been coding for 3 hours straight. Take a break."
    Proactive wellness nudges.
    No push-to-user channel today. Needs OS notification integration plus event-driven timers.

17. Burnout detection
    "Your commit velocity dropped 40 percent this week, and you are working past midnight."
    Pattern-based wellness alerts.
    Data exists, but needs analytics plus proactive notification.

### E. Social and Relationship Context

18. Personal CRM
    "When did I last talk to person X? What did we discuss?"
    Tracks professional relationships across conversations.
    If conversations mention people, facts can be extracted. No person entity model and no communication data capture yet.

19. Meeting prep
    "I am meeting with Sarah from Stripe tomorrow. Here is everything I know about her."
    Aggregates context about people before meetings.
    If facts about Sarah exist, agent can retrieve them. But no calendar integration exists yet.

### F. Work and Productivity

20. Standup generator
    "Generate my standup from yesterday's activity."
    Zero-effort formatted standups from actual work.
    Git events plus command events plus conversation history from yesterday. Agent summarizes into standup format.

21. Time tracking per project
    "How much time did I spend on project X versus Y this week?"
    Project-level time allocation.
    Events have timestamps and `cwd`, but inferring active time versus idle time from gaps is imprecise. True accuracy needs focus tracking.

22. Task and TODO tracking
    "Remember I need to fix the auth bug before Friday."
    Personal task management with deadlines.
    Facts with `valid_to` as a deadline plus a `get_pending_tasks` tool. No external task integration yet.

23. Deep work analytics
    "When are my most productive hours?"
    Identifies optimal focus periods from activity patterns.
    Command frequency by hour is derivable, but "productive" is subjective. Needs commit frequency and analytics.

### G. Communication Integrations

24. Slack search
    "What did John say about the API design in `#backend` last week?"
    Cross-references Slack with engineering context.
    No Slack integration. Needs OAuth, WebSocket connection, and message ingestion.

25. Email digest
    "Summarize my unread engineering-related emails."
    Filters and summarizes relevant emails.
    No email integration. Needs IMAP or Gmail API and significant data handling.

26. Discord context
    "What was the consensus on the RFC in `#architecture`?"
    Same pattern as Slack.
    Same infrastructure requirements as Slack.

### H. Creative and Writing

27. Blog from activity
    "Turn my last week of learnings into a blog post."
    Synthesizes engineering diary entries from captured activity.
    Facts plus events provide raw material. Agent synthesizes.

28. PR description writer
    "Write a PR description for my current branch."
    Generates context-rich PR descriptions.
    Git events plus branch context. Shell out to `git diff` and `git log`, then synthesize.

### I. Financial and Career

29. Compensation tracking
    "Track my salary history, equity vesting, 401k contributions."
    Personal financial record-keeping.
    Can be stored as manual facts, but no structured financial model or external integrations exist.

30. Interview prep
    "Based on my work history, help me prepare for a system design interview."
    Experience-based interview coaching.
    Agent queries accumulated facts about work history and generates responses.

### J. Developer Tooling

31. CI and CD failure context
    "My GitHub Actions build failed. What changed since the last green build?"
    Correlates CI failures with recent changes.
    GitHub API can fetch workflow runs, but there is no webhook listener for real-time CI notifications.

32. IDE integration
    "Send my VS Code activity to Bodhi."
    Captures editor events like file opens, saves, and searches.
    MCP server is planned. VS Code extension would POST events to the daemon API.

33. Cloud resource awareness
    "You spun up 3 EC2 instances last week that are still running."
    Tracks cloud infrastructure usage.
    No cloud provider API integrations today.

34. Docker tracking
    "You have 12 stopped containers eating 8GB of disk."
    On-demand container status.
    Tool can shell out to `docker ps -a` and `docker system df`.

### K. Team and Collaboration

35. Shared team memory
    "Our team's deployment runbook, updated from actual deployments."
    Collaborative knowledge base.
    Current architecture is single-user. This would require multi-user auth, shared memory spaces, and access control.

### L. Cross-Device

36. Multi-device sync
    "Sync my Bodhi memory between laptop and desktop."
    Seamless memory across machines.
    Planned via sync-capable storage, but conflict resolution and auth remain non-trivial.

### M. Automation

37. Event-triggered actions
    "When I push to main, auto-generate release notes."
    Reactive workflows from activity.
    Event bus can detect events, but there is no trigger-action system yet.

38. Scheduled queries
    "Every Friday at 5pm, generate my weekly summary."
    Cron-like automated queries.
    Daemon runs continuously but has no scheduler subsystem today.

### N. Privacy and Security

39. Secret redaction
    "Never store anything matching API keys or passwords."
    Automatic PII and secret filtering.
    Addressed in the current architecture via secret scanning plus keyword-proximity redaction.

40. Selective memory
    "Forget everything about project X" or "Do not capture in this directory."
    Granular privacy controls.
    Facts can be invalidated today, but bulk deletion by project or directory and capture exclusion rules do not exist yet.

41. Air-gapped mode
    "Run entirely local with no cloud calls, using a local LLM."
    Privacy-first operation.
    Multi-provider support makes this a clean extension, but local-model support still needs implementation.

### O. Self-Improvement

42. Skill progression tracking
    "Your Rust proficiency has grown from 2 out of 10 to 6 out of 10 based on your activity."
    Data-driven skill assessment.
    Facts can store skills, but proficiency scoring needs a taxonomy, heuristics, and careful confidence handling.

## Round 2: 35 Use Cases

These were tested against the updated architecture and classified as 17 NATIVE, 18 CLEAN, and 0 FORCED.

### Group 1: Basic Memory

43. Remember preference
    "I prefer Vim keybindings."
    User statement to agent to `store-fact` to facts table with confidence 1.0. Retrieved in future prompts. NATIVE.

44. Weekly recall
    "What did I work on last week?"
    Agent searches events with temporal filtering and bounded retrieval. NATIVE.

45. Tech stack transition
    "I just switched from React to Svelte on the dashboard project."
    Bi-temporal invalidation of old fact plus creation of new fact. NATIVE.

46. Shell command capture
    User runs `kubectl apply -f deploy.yaml`.
    Shell hook to pipeline to events table. Cold path extracts "user deploys with kubectl." NATIVE.

47. Git commit capture
    User commits `fix: auth token refresh bug`.
    Git hook to pipeline to events table. Cold path extracts "user working on auth system." NATIVE.

48. Fuzzy recall
    "What is the name of that CLI tool I was exploring last Tuesday?"
    FTS5 plus temporal filter on events. NATIVE.

49. Secret redaction
    User runs `export API_KEY=sk-live-abc123`.
    Redaction middleware detects the pattern and replaces it with `[REDACTED]` before storage. NATIVE.

### Group 2: Knowledge Graph and Relationships

50. Person recall
    "Who is Sarah?"
    Searches facts for person entities and traverses `fact_links` for projects, teams, and context. CLEAN.

51. Project listing
    "What projects am I involved in?"
    Queries project facts and relationships. NATIVE.

52. Entity relationships
    "How is the auth-service related to the payments team?"
    Graph traversal across `fact_links`. CLEAN.

53. Fact conflicts
    "I use PostgreSQL" but previously said "I use MySQL."
    Bi-temporal supersession handles conflicts. NATIVE.

54. Inferred facts
    User consistently runs `pytest` instead of `jest`.
    Pattern detection creates a lower-confidence inferred fact. CLEAN.

55. Temporal stack queries
    "What changed about my stack in the last 3 months?"
    Queries facts with `valid_from` and `valid_to` in range. NATIVE.

56. Confidence decay
    Old facts lose relevance without reinforcement.
    Requires periodic review or ranking decay. CLEAN.

### Group 3: Multi-Source Ingestion

57. Browser history capture
    Browser extension to daemon HTTP POST to pipeline to events table. CLEAN.

58. Calendar integration
    Calendar API capture source to pipeline to events table. CLEAN.

59. Slack capture
    Slack API to pipeline to redaction to fact extraction. CLEAN.

60. Cross-source correlation
    "What was I doing when that deploy failed?"
    Temporal windowing across all event types. CLEAN.

61. Deduplication
    Same event captured from multiple sources.
    Pipeline dedup middleware filters duplicates. CLEAN.

62. Source priority
    Explicit statement versus inferred behavior.
    Confidence scoring differentiates explicit from inferred. NATIVE.

63. Bulk import
    "Import my last 1000 shell commands from `zsh_history`."
    CLI to daemon API to per-event pipeline processing. CLEAN.

### Group 4: Agent and LLM Interactions

64. Multi-step reasoning
    "Find all my TODOs from this week and prioritize them."
    Agent loop with multi-tool call. NATIVE.

65. Tool chaining
    Search memory, then use the result to query GitHub.
    Sequential tool calls inside the agent loop. NATIVE.

66. Model switching
    Cheap model for simple queries, expensive model for complex reasoning.
    Provider routing by query complexity. CLEAN.

67. Streaming responses
    Long responses stream to the terminal.
    LLM streaming to SSE to CLI rendering. NATIVE.

68. Context-window management
    Conversations exceed the model window.
    Dynamic prompt builder selects relevant facts and events. CLEAN.

69. Error recovery
    LLM call fails mid-conversation.
    Retry with backoff and graceful degradation to cached facts. CLEAN.

70. Proactive notifications
    "You have a meeting in 10 minutes."
    Scheduler checks events and pushes notifications. CLEAN.

### Group 5: Operational and Production

71. Cold-start performance
    Daemon starts quickly with lightweight server and DB setup. NATIVE.

72. Concurrent access
    Multiple terminal sessions hit the daemon simultaneously.
    WAL mode and `BEGIN IMMEDIATE` make this a clean extension of current storage. CLEAN.

73. Schema migration
    Database schema changes between versions.
    Migration tooling plus read-time schema versioning. CLEAN.

74. Backup and restore
    Export and import memory.
    SQLite single-file backup is operationally straightforward. NATIVE.

75. Privacy deletion
    "Delete all facts about topic X."
    Query plus delete plus `fact_links` cleanup plus FTS rebuild. CLEAN.

76. Plugin and extension
    Third-party capture source posts typed events to the daemon API. CLEAN.

77. Debugging and audit
    "Why did Bodhi forget X?"
    Trace events to facts through provenance and correlation IDs. CLEAN.

## Top 5 "Holy Shit" Extensions

1. Automatic standup generator
   `bodhi standup` produces a formatted standup from yesterday's activity. Immediate daily value.

2. Branch context resurrection
   "Where did I leave off on `feature-auth-v2` three weeks ago?"
   Reconstruct the last commands, files touched, error being debugged, and next likely action.

3. Commit archaeology
   `bodhi why <sha>` gives the story behind a commit: the bug, the discussion, and the failed alternatives.

4. Cross-session error pattern detection
   "You have hit this same `ECONNREFUSED` error 7 times across 3 projects. Every time, Docker was not running."

5. Personal engineering knowledge graph
   A queryable graph of everything learned, built, and worked on, connected by relationships.
