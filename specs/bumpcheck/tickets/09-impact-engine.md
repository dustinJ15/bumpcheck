# 09 — Impact analysis: engine

**Status:** ready-for-agent

**Who:** worker · **Changes a page:** no · **Blocked by:** 08 closed with a "go"
**Stories:** 52–55 (logic only) · **Decisions:** 12

Read [README.md](./README.md) in this folder first; its rules and "Done means" apply here.

This is the stretch. Do not start until ticket 08's completion note records Dustin's go.

## Goal

Given a project with breaking verdicts, work out which breaking changes touch APIs the repo's
code uses, with file and line numbers. Code-only matching: no AI, free, reproducible, and
explainable line by line. All in memory against fakes; no platform wiring in this ticket.

## Build

**Import scanner** (pure). A source file's text in; the packages it imports out. Covers static
imports, `require`, dynamic imports and subpath imports (`pkg/sub` and `@scope/pkg/sub` both
resolve to their package). Plain text scanning; no parser dependency.

**Usage matcher** (pure). A file's text and a list of API names in; the lines where they
appear as whole identifiers out, with line numbers.

**Source host additions:** raw file contents for analysis, added to the existing interface
with a fake. The real implementation is plain `fetch` to GitHub's raw file host; write and
type-check it, do not call it.

**Impact engine.** For a project with breaking verdicts:

1. Read the file tree once.
2. Keep files of type `.js .jsx .ts .tsx .mjs .cjs`. Skip dependency folders, build output,
   minified files and files over 200 KB. Take the first 400, then mark the result partial.
3. Build the map of which files import which package, keyed by the commit. Reuse a stored map
   when the commit has not changed.
4. For each breaking change, search the files importing that package for its API names.
5. Produce a result per breaking change: usage found (with files and lines), no usage found,
   or can't tell (the change lists no API names, or the files could not be read).

Like the scan engine, it runs one step at a time with resumable state, spreads file fetches
across steps, and has no platform imports. Every number comes from the config module.

**Data:** add the impact results and the import map to the projects schema, written only by
server code.

## Tests required

- Unit, import scanner: each import form; subpaths; scoped packages; relative imports ignored;
  imports inside comments and strings are not counted, or the limitation is stated in a test
  name.
- Unit, usage matcher: whole identifiers only (`parse` does not match `parseAsync`); correct
  line numbers; no names means no matches.
- Engine, with fakes: usage found with correct files and lines; no usage found; can't tell;
  each skip rule; the 400-file cap marks the result partial; an unchanged commit reuses the
  stored map and fetches no files; an interrupted run resumes.

## Done means

Acceptance: the tests above exist and pass; the modules import nothing from `deepspace`; the
gate is green.
Evidence: the full pasted output of `npm run gate` in a `## Completion` section below. No
screenshot needed.
