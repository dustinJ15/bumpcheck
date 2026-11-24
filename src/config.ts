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
   * Times bumpcheck tries to email one verdict: the first send and, if that
   * fails, one retry after the next scan. After that the verdict is left as
   * failed in the send log and is not tried again.
   */
  alertSendAttemptsPerVerdict: 2,
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

/** Email alerts (src/engine/alert.ts). */
export const ALERT_EMAIL = {
  /**
   * Where a reply to an alert goes. Null: no reply-to is set, and a reply
   * goes to the platform's shared sending address, which nobody reads. Put
   * an address here to receive replies. (The sender itself cannot be
   * changed: the email integration always sends from the platform's address.)
   */
  replyTo: null as string | null,
} as const

export const JUDGE = {
  /** The model that writes verdicts. */
  model: 'claude-haiku-5-5',
  /**
   * Output cap per verdict, in tokens. Sized to fit the biggest answer the
   * validator accepts (VERDICT_SHAPE below), so an answer that keeps to the
   * bounds is never cut off:
   *
   *   per change: title 100 + whatChanged 300 + whatToDo 300
   *               + 5 API names x 60 = 1,000 characters of text
   *   whole answer at the bounds, pretty-printed JSON (keys, quotes,
   *   indents): 8 changes + a 400-character summary = 9,789 characters
   *   9,789 / 3 characters per token = 3,263 tokens
   *
   * 3,500 leaves room for escaped quotes and a ```json fence. The test
   * "the output cap fits the biggest answer..." in src/core/verdict.test.ts
   * redoes this sum, so changing a bound without the cap goes red.
   */
  maxOutputTokens: 3500,
  /**
   * The few characters per token assumed above. Real text averages more;
   * code names and JSON punctuation can be fewer, so 3 is on the safe side.
   */
  worstCaseCharsPerToken: 3,
  /**
   * The share of each VERDICT_SHAPE character limit the prompt asks for.
   * The model is told 60% of what the validator allows (a 300-character
   * note is asked for as 180), so an answer that runs a little long still
   * passes instead of costing a paid retry. The number of changes is not
   * scaled: the prompt and the validator ask for the same count.
   */
  promptShare: 0.6,
  /** Changelog text longer than this is cut, and the verdict says so. */
  changelogInputCapChars: 30_000,
  /**
   * Attempts per verdict: one try and one retry, then the verdict is
   * "failed". When the first answer was cut off at the output cap, the retry
   * asks for fewer changes (VERDICT_SHAPE.shorterChangesPerVerdict).
   */
  attemptsPerVerdict: 2,
} as const

/**
 * Size limits on a verdict the judge returns. The prompt states each one to
 * the model (each character limit scaled down by JUDGE.promptShare, for
 * headroom), and a response over any of them is rejected (and retried), so
 * one runaway answer cannot bloat the shared cache that every project reads
 * or run past the output cap above.
 */
export const VERDICT_SHAPE = {
  summaryChars: 400,
  /** Changes per verdict, the most important first. */
  changesPerVerdict: 8,
  /** Asked for in the retry after an answer was cut off at the output cap. */
  shorterChangesPerVerdict: 3,
  titleChars: 100,
  /** For "whatChanged" and "whatToDo". */
  noteChars: 300,
  apiNamesPerChange: 5,
  apiNameChars: 60,
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

/**
 * The public example report the landing page links to ("See an example
 * report" goes to /share/<this id>).
 *
 * TO CHANGE AFTER THE FIRST DEPLOY: on the live site, add the example repo
 * (dustinJ15/bumpcheck-example) as a project, switch it to public on its
 * settings page, and copy the last part of the shareable link shown there
 * (https://.../share/<id>) into this constant. Then deploy again.
 *
 * Until then it names a local fixture: the browser tests publish a report
 * under this id on the local test server (`test-publish-example` in
 * src/actions/test-reset.ts). On a deployed site the placeholder id matches
 * nothing, and the link shows "This report is not available".
 */
export const EXAMPLE_PROJECT_ID = 'local-example-fixture'
