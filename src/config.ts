/**
 * Every limit and cap bumpcheck applies, in one place.
 *
 * The whole app runs on one DeepSpace account with a fixed budget, so these
 * numbers are the budget. No limit may be written anywhere else: import it
 * from here. The values match the spec's "Limits and caps" table.
 *
 * Time values are in milliseconds so they compare directly with `Date.now()`.
 */

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export const LIMITS = {
  /** Projects one user may have. The app owner is exempt. */
  projectsPerUser: 3,
  /** Dependencies (runtime + dev) a project's package.json may declare. */
  dependenciesPerProject: 150,
  /** New AI verdicts one scan may ask for. Runtime dependencies go first. */
  newVerdictsPerScan: 15,
  /** AI calls per UTC day, across the whole app. Nobody is exempt. */
  aiCallsPerDay: 150,
  /** How long "scan now" is unavailable after a scan was requested. */
  scanNowCooldownMs: 10 * MINUTE_MS,
  /** How long after a scan a project is due for its next daily scan. */
  rescanIntervalMs: 24 * HOUR_MS,
  /** A project not opened by its owner for this long stops being scanned. */
  idlePauseMs: 7 * DAY_MS,
  /** Test emails one user may send per UTC day. The app owner is exempt. */
  testEmailsPerUserPerDay: 3,
  /** Alert emails one project may send per UTC day. */
  alertEmailsPerProjectPerDay: 1,
  /**
   * Add-project attempts one user may make per UTC day. An attempt is a
   * request that gets as far as GitHub: each one costs the owner one or two
   * GitHub calls even when the repo is then refused. The app owner is exempt.
   */
  addAttemptsPerUserPerDay: 20,
} as const

/** The scheduled task that starts the daily scans (src/cron.ts). */
export const SCHEDULE = {
  /** The task's name in the cron room. */
  taskName: 'daily-scans',
  /** How often the task runs. The platform takes whole minutes. */
  tickIntervalMinutes: 60,
  /**
   * Scans one run of the task may enqueue. Scans run one at a time in the
   * job room, so this is also roughly how many can finish before the next run.
   */
  scansPerTick: 5,
  /**
   * A project that has been "queued" or "scanning" this long with no sign of
   * life from its job is treated as failed. A job tick may run for 15
   * minutes at most and writes progress as it goes, so twice that is safe.
   */
  stalledScanMs: 30 * MINUTE_MS,
} as const

export const JUDGE = {
  /** The model that writes verdicts. */
  model: 'claude-haiku-5-5',
  /** Output cap per verdict, in tokens. */
  maxOutputTokens: 1500,
  /** Changelog text longer than this is cut, and the verdict says so. */
  changelogInputCapChars: 30_000,
  /** Attempts per verdict: one try and one retry, then the verdict is "failed". */
  attemptsPerVerdict: 2,
} as const

/**
 * Size limits on a verdict the judge returns. A response over any of these
 * is rejected (and retried), so one runaway answer cannot bloat the shared
 * cache that every project reads.
 */
export const VERDICT_SHAPE = {
  summaryChars: 1000,
  changesPerVerdict: 30,
  titleChars: 200,
  /** For "whatChanged" and "whatToDo". */
  noteChars: 2000,
  apiNamesPerChange: 50,
  apiNameChars: 200,
} as const

export const IMPACT = {
  /** Source file types the stretch impact analysis reads. */
  fileExtensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
  /** Folders the impact analysis never reads (dependency folders, build output). */
  skippedFolders: ['node_modules', 'dist', 'build', 'out', '.next', 'coverage', 'vendor'],
  /** Files larger than this are skipped. */
  maxFileBytes: 200 * 1024,
  /** Files read per repo before the result is marked partial. */
  filesPerRepo: 400,
} as const

/**
 * Pacing inside one scan. Not a budget limit, but still a number the engine
 * would otherwise hard-code, so it lives here too.
 */
export const SCAN_PACING = {
  /** Registry lookups the engine makes in one step before checkpointing. */
  registryLookupsPerStep: 25,
  /**
   * Outbound calls (registry, GitHub, judge) one job tick may make. Once a
   * tick has made this many, the job saves its state and continues on the
   * next tick. The platform documents no subrequest ceiling, so this stays
   * conservative.
   */
  outboundCallsPerTick: 30,
  /** How long one outbound call may take before it is abandoned. */
  outboundTimeoutMs: 20_000,
  /** How long the one judge call for a verdict may take. */
  judgeTimeoutMs: 60_000,
  /** Failed ticks a scan may have before it is marked failed: the second failure ends it (one retry). */
  failedTicksPerScan: 2,
  /** How long a scan waits before retrying after a failed tick. */
  retryDelayMs: 5_000,
  /**
   * How many times the job room may run the handler for one scan: every
   * tick and every restart after an interruption counts as one run. Far more
   * than a 150-dependency scan needs; it only stops a scan that never ends.
   */
  jobRunsPerScan: 60,
} as const
