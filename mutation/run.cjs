/** @file Runs one deliberate backend defect at a time against unchanged tests in disposable copies. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Script } = require('node:vm');
const mutants = require('./mutants.cjs');

const root = path.resolve(__dirname, '..');
const timeoutMs = 30000;
const sourceFiles = ['src/app.js', 'src/database.js', 'test/app.test.js'];

/** Fingerprint application/test files to verify that real source was not mutated.
 * Input parameters: none; reads sourceFiles relative to root.
 * @returns {string} SHA-256 digest of those source bytes and paths.
 */
function fingerprint() {
  const hash = crypto.createHash('sha256');
  for (const file of sourceFiles) hash.update(file).update(fs.readFileSync(path.join(root, file)));
  return hash.digest('hex');
}

/** Apply exactly one occurrence of one text replacement to a copy.
 * @param {object} mutant Definition with file/find/replace and optional occurrence index.
 * @param {string} original Unmutated source text.
 * @returns {string} Mutated, syntax-checked source; throws for stale/ambiguous anchors or invalid JavaScript.
 */
function applyMutation(mutant, original) {
  const count = original.split(mutant.find).length - 1;
  if (!count || (count > 1 && mutant.occurrence === undefined)) throw new Error(`${mutant.id}: expected an unambiguous mutation anchor, found ${count}`);
  const occurrence = mutant.occurrence ?? 0;
  if (occurrence >= count) throw new Error(`${mutant.id}: missing occurrence ${occurrence}`);
  let index = -1;
  for (let current = 0; current <= occurrence; current++) index = original.indexOf(mutant.find, index + 1);
  const modified = original.slice(0, index) + mutant.replace + original.slice(index + mutant.find.length);
  new Script(modified, { filename: mutant.file });
  return modified;
}

/** Construct an independent application copy; dependency resolution reuses the read-only installed packages.
 * @param {string} sandbox Newly created temporary root.
 * @param {string} name Child name for baseline or mutant.
 * @returns {string} Working directory containing src, test, public and views, without runtime data.
 */
function makeCopy(sandbox, name) {
  const directory = path.join(sandbox, name);
  fs.mkdirSync(directory);
  for (const folder of ['src', 'test', 'public', 'views']) fs.cpSync(path.join(root, folder), path.join(directory, folder), { recursive: true });
  return directory;
}

/** Execute the unchanged suite in one Node process, with a strict timeout.
 * @param {string} directory Isolated working directory.
 * @returns {object} Outcome, elapsed time, TAP output, exit code and names of failed tests.
 */
function runTests(directory) {
  const started = Date.now();
  // Disabling test-process isolation avoids orphaned test workers if a mutant times out.
  const result = spawnSync(process.execPath, ['--test', '--test-isolation=none', '--test-reporter=tap', 'test/app.test.js'], {
    cwd: directory, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, NODE_PATH: path.join(root, 'node_modules'), NO_COLOR: '1', FORCE_COLOR: '0' }
  });
  const output = (result.stdout || '') + (result.stderr || '');
  const failedTests = [];
  for (const match of output.matchAll(/^not ok \d+ - (.+)$/gm)) failedTests.push(match[1].trim());
  const status = result.error?.code === 'ETIMEDOUT' ? 'timeout' : result.error ? 'error' : result.status === 0 ? 'survived' : failedTests.length ? 'killed' : 'error';
  const testCount = Number(output.match(/^# tests (\d+)$/m)?.[1] || 0);
  return { status, elapsedMs: Date.now() - started, exitCode: result.status, testCount, failedTests, output, error: result.error?.message || null };
}

/** Remove only a verified runner-owned temporary subtree.
 * @param {string} directory Target path.
 * @param {string} sandbox Runner-owned temporary root; root or a descendant may be removed.
 * @returns {void} Deletes the isolated files; throws if path containment or the root prefix is invalid.
 */
function removeCopy(directory, sandbox) {
  const absoluteRoot = path.resolve(sandbox);
  const absoluteTarget = path.resolve(directory);
  const tempPrefix = path.join(path.resolve(os.tmpdir()), 'smartbrew-mutation-');
  if (!absoluteRoot.startsWith(tempPrefix) || (absoluteTarget !== absoluteRoot && !absoluteTarget.startsWith(absoluteRoot + path.sep))) throw new Error('Unsafe mutation cleanup path.');
  fs.rmSync(absoluteTarget, { recursive: true, force: true });
}

/** Create machine-readable evidence and a concise Markdown assessment.
 * @param {object} report Baseline, mutant results and source fingerprints.
 * @returns {void} Writes JSON/Markdown reports and full TAP logs into reports/mutation.
 */
function writeReport(report) {
  const directory = path.join(root, 'reports', 'mutation');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const counts = { killed: 0, survived: 0, invalid: 0, timeout: 0, error: 0 };
  for (const result of report.results) counts[result.status]++;
  const assessed = counts.killed + counts.survived;
  const score = assessed ? (100 * counts.killed / assessed).toFixed(1) : 'N/A';
  const lines = [
    '# SmartBrew mutation assessment', '',
    `Generated: ${report.generatedAt}. Node: ${report.nodeVersion}.`, '',
    `Baseline: **${report.baseline.status === 'passed' ? 'passed' : 'failed'}**. Suite: **${report.baseline.testCount} tests**, held unchanged throughout this run.`, '',
    `**${counts.killed} killed / ${assessed} assessed mutants = ${score}% mutation score.**`, '',
    `${counts.survived} survived; ${counts.invalid} invalid; ${counts.timeout} timed out; ${counts.error} runner errors. Invalid/timeout/error outcomes are excluded from the score and shown separately.`, '',
    'A killed mutant made at least one test fail. A survivor passed the unchanged suite and needs review. These are 40 hand-selected backend mutations, not exhaustive automated mutation coverage; the score is specific to this set. It does not measure browser rendering, usability or all possible defects. No survivors are automatically declared equivalent.', '',
    `Selection: ${report.selection}. Source/test fingerprints unchanged: **${report.sourceUnchanged}**.`, '',
    'Run again: `npm.cmd run test:mutation`. List definitions: `npm.cmd run test:mutation -- --list`. Run a subset: `npm.cmd run test:mutation -- --only M05,M13`. Subset runs replace these reports and identify their selection.', '',
    '| ID | Deliberate defect | Result | Failing test evidence |', '|---|---|---|---|'
  ];
  for (const result of report.results) {
    const evidence = result.failedTests?.length ? result.failedTests.join('; ') : result.error || 'No failing test';
    lines.push(`| ${result.id} | ${result.title} | ${result.status} | ${evidence.replaceAll('|', '/')} |`);
  }
  lines.push('', '## Review survivors', '', 'The original mutation definitions (exact before/after snippets) are in mutation/mutants.cjs and the JSON report. The initial sixteen-test assessment and original test source are preserved in reports/mutation/initial. Compare these results before making claims about improved coverage; a score for this selected backend set does not prove the absence of other defects.', '');
  fs.writeFileSync(path.join(directory, 'report.md'), lines.join('\n'));
  console.log(`\nMutation score: ${counts.killed}/${assessed} (${score}%). Survived: ${counts.survived}; invalid: ${counts.invalid}; timeout: ${counts.timeout}; errors: ${counts.error}.`);
  console.log('Reports: reports/mutation/report.md and report.json');
}

/** Run a baseline and the selected independent mutants without touching real source or data.
 * Input parameters: none; accepts --list or --only ID,ID via process.argv.
 * @returns {void} Writes progress/reports; sets a failing process code for baseline or infrastructure errors, not merely survivors.
 */
function main() {
  if (process.argv.includes('--list')) { for (const mutant of mutants) console.log(`${mutant.id} ${mutant.title}`); return; }
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--only')) throw new Error('Usage: node mutation/run.cjs [--list | --only M01,M02]');
  const requested = args.length ? new Set(args[1].split(',')) : null;
  const selected = [];
  for (const mutant of mutants) if (!requested || requested.has(mutant.id)) selected.push(mutant);
  if (requested && selected.length !== requested.size) throw new Error('Unknown mutant ID. Use --list.');
  // Preflight all anchors before starting a lengthy run.
  for (const mutant of selected) applyMutation(mutant, fs.readFileSync(path.join(root, mutant.file), 'utf8'));
  const before = fingerprint();
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'smartbrew-mutation-'));
  const report = { generatedAt: new Date().toISOString(), nodeVersion: process.version, selection: requested ? args[1] : 'all 40 mutants', timeoutMs, sourceBefore: before, sourceAfter: null, sourceUnchanged: false, baseline: null, results: [] };
  const logs = path.join(root, 'reports', 'mutation', 'logs');
  fs.mkdirSync(logs, { recursive: true });
  try {
    console.log('Checking unchanged baseline in an isolated copy…');
    const baselineDirectory = makeCopy(sandbox, 'baseline');
    const baseline = runTests(baselineDirectory);
    fs.writeFileSync(path.join(logs, 'baseline.tap'), baseline.output);
    report.baseline = { ...baseline, status: baseline.status === 'survived' ? 'passed' : 'failed', output: undefined };
    removeCopy(baselineDirectory, sandbox);
    if (report.baseline.status !== 'passed') throw new Error('Unchanged baseline failed; mutation scoring aborted. See baseline.tap.');
    console.log('Baseline passed. Testing one deliberate defect at a time…');
    for (const mutant of selected) {
      const directory = makeCopy(sandbox, mutant.id);
      try {
        const original = fs.readFileSync(path.join(directory, mutant.file), 'utf8');
        let modified;
        try { modified = applyMutation(mutant, original); }
        catch (error) { report.results.push({ ...mutant, status: 'invalid', failedTests: [], error: error.message }); continue; }
        fs.writeFileSync(path.join(directory, mutant.file), modified);
        const result = runTests(directory);
        fs.writeFileSync(path.join(logs, `${mutant.id}.tap`), result.output);
        report.results.push({ ...mutant, ...result, output: undefined, log: `logs/${mutant.id}.tap` });
        console.log(`${mutant.id} ${result.status.toUpperCase()} (${(result.elapsedMs / 1000).toFixed(1)}s): ${mutant.title}`);
      } finally { removeCopy(directory, sandbox); }
    }
  } finally {
    removeCopy(sandbox, sandbox);
    report.sourceAfter = fingerprint();
    report.sourceUnchanged = report.sourceAfter === before;
    writeReport(report);
    if (!report.sourceUnchanged) throw new Error('Real source/test fingerprint changed during mutation run.');
  }
  for (const result of report.results) if (['invalid', 'error', 'timeout'].includes(result.status)) process.exitCode = 1;
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
