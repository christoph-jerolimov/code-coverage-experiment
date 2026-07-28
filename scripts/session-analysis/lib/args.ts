/**
 * CLI argument parsing.
 *
 * Layer-1 filter flags are not interpreted here — they are forwarded verbatim
 * to `agentsview session list`, so the scripts automatically support the same
 * project/machine/date/… filtering as agentsview itself.
 */

/** `agentsview session list` flags that take a value. */
export const LIST_VALUE_FLAGS = [
  '--agent',
  '--project',
  '--machine',
  '--git-branch',
  '--date',
  '--date-from',
  '--date-to',
  '--active-since',
  '--min-messages',
  '--max-messages',
  '--min-user-messages',
  '--outcome',
  '--health-grade',
  '--min-tool-failures',
  '--limit',
] as const;

/** `agentsview session list` flags without a value. */
export const LIST_BOOLEAN_FLAGS = [
  '--resume',
  '--active',
  '--include-one-shot',
  '--include-automated',
  '--include-children',
  '--has-secret',
] as const;

/** Flags forwarded to every agentsview invocation (daemon/database selection). */
export const COMMON_VALUE_FLAGS = ['--server', '--server-token-file'] as const;
export const COMMON_BOOLEAN_FLAGS = ['--pg'] as const;

export interface ParsedArgs {
  /** Detector ids to run; empty means "all detectors". */
  detectors: string[];
  skill: string;
  jiraProjects: string[];
  json: boolean;
  idsOnly: boolean;
  noPrefilter: boolean;
  bin: string;
  listArgs: string[];
  commonArgs: string[];
  help: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    detectors: [],
    skill: 'rhdh-jira',
    jiraProjects: [],
    json: false,
    idsOnly: false,
    noPrefilter: false,
    bin: process.env['AGENTSVIEW_BIN'] ?? 'agentsview',
    listArgs: [],
    commonArgs: [],
    help: false,
  };

  const takeRawValue = (flag: string, index: number): string => {
    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(`Flag ${flag} requires a value`);
    }
    return value;
  };

  const takeValue = (flag: string, index: number): string => {
    const value = takeRawValue(flag, index);
    if (value.startsWith('--')) {
      throw new Error(`Flag ${flag} requires a value`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case '--help':
      case '-h':
        parsed.help = true;
        continue;
      case '--detect':
        parsed.detectors.push(takeValue(arg, i++));
        continue;
      case '--skill':
        parsed.skill = takeValue(arg, i++);
        continue;
      case '--jira-project':
        parsed.jiraProjects.push(takeValue(arg, i++).toUpperCase());
        continue;
      case '--json':
        parsed.json = true;
        continue;
      case '--ids':
        parsed.idsOnly = true;
        continue;
      case '--no-prefilter':
        parsed.noPrefilter = true;
        continue;
      case '--agentsview-bin':
        parsed.bin = takeValue(arg, i++);
        continue;
      case '--list-arg':
        // Escape hatch for `session list` flags this parser does not know yet,
        // so the value may itself start with "--".
        parsed.listArgs.push(takeRawValue(arg, i++));
        continue;
      default:
        break;
    }

    if ((LIST_VALUE_FLAGS as readonly string[]).includes(arg)) {
      parsed.listArgs.push(arg, takeValue(arg, i++));
    } else if ((LIST_BOOLEAN_FLAGS as readonly string[]).includes(arg)) {
      parsed.listArgs.push(arg);
    } else if ((COMMON_VALUE_FLAGS as readonly string[]).includes(arg)) {
      parsed.commonArgs.push(arg, takeValue(arg, i++));
    } else if ((COMMON_BOOLEAN_FLAGS as readonly string[]).includes(arg)) {
      parsed.commonArgs.push(arg);
    } else {
      throw new Error(`Unknown flag "${arg}". Run with --help for usage.`);
    }
  }

  if (parsed.idsOnly && parsed.detectors.length !== 1) {
    throw new Error('--ids requires exactly one --detect <id> so the output is unambiguous');
  }

  return parsed;
}

export const USAGE = `Analyse agentsview sessions with pluggable detectors.

Usage:
  analyse-sessions [layer-1 filters] [--detect <id>]... [output options]

Layer 1 — base session filters (forwarded to \`agentsview session list\`):
  ${LIST_VALUE_FLAGS.map((f) => `${f} <value>`).join('\n  ')}
  ${LIST_BOOLEAN_FLAGS.join('\n  ')}
  --list-arg <raw>          forward an arbitrary extra token to \`session list\`

Layer 2 — detectors (default: run all):
  --detect <id>             repeatable; one of:
                              skill-usage, jira-reference, jira-field-change,
                              github-issue-reference, github-pr-reference, pr-created
  --skill <name>            skill name for skill-usage (default: rhdh-jira)
  --jira-project <KEY>      repeatable; restrict Jira detection to these project keys
  --no-prefilter            skip \`session search\` narrowing, deep-scan every base session

Layer 3 — output:
  (default)                 human-readable summary + per-detector session lists
  --json                    machine-readable output (schema_version 1)
  --ids                     print only matching session ids (requires exactly one --detect)

agentsview connection:
  --agentsview-bin <path>   agentsview binary (default: agentsview, or $AGENTSVIEW_BIN)
  --server <url> --server-token-file <path> --pg   forwarded to every agentsview call
`;
