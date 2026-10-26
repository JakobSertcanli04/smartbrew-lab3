# Mutation testing approach

The current twenty-five HTTP/SQLite integration tests are assessed against forty deliberate backend defects. The original sixteen-test assessment is preserved under `reports/mutation/initial/`. Nine regression cases were added to address its survivors; each assessment then holds its selected test suite unchanged throughout the run.

Run from the project root:

```powershell
npm.cmd run test:mutation
```

The runner in `mutation/run.cjs` first copies the unmodified app and tests to a temporary directory and requires that baseline to pass. Each mutant then receives a fresh independent copy with one exact source replacement from `mutation/mutants.cjs`. Only the copy is modified; the demonstration database is never copied or opened. CommonJS dependencies resolve to the already installed packages through `NODE_PATH`, so there is no additional package installation. Real backend/test source fingerprints are verified at the end.

The test command uses explicit `test/app.test.js` selection and a single test process, avoiding accidental discovery of generated files or orphaned test workers. Each suite has a thirty-second timeout. Temporary cleanup checks that its resolved target belongs to the runner-created temporary root before deleting it.

## Interpreting the evidence

- **Killed:** the unchanged tests fail for the defect. The report includes failing test names and a TAP log.
- **Survived:** the tests still pass. Review the changed behavior and add a meaningful test if the requirement is not otherwise covered.
- **Invalid/error/timeout:** an unusable change or infrastructure outcome, recorded separately. These are not counted as successful detections.

The score is `killed / (killed + survived) × 100`. This is a targeted mutation assessment, not a claim that every source expression was mutated. It does not assess frontend rendering, browser event behavior, all SQL properties or every requirement. No survivor is automatically labeled equivalent. Before strengthening the suite, preserve the initial report to keep the initial and improved results distinct.

The generated evidence is in [reports/mutation/report.md](../reports/mutation/report.md) and [report.json](../reports/mutation/report.json). Full baseline/mutant TAP logs are generated under `reports/mutation/logs/`. The JSON includes exact source replacements, result classification, failed test names, elapsed time and fingerprints. A subsequent run replaces the report files; copy them first if retaining a historical result.

To inspect definitions or rerun a particular group:

```powershell
npm.cmd run test:mutation -- --list
npm.cmd run test:mutation -- --only M05,M13
```

The runner reports subset selection explicitly. A passing mutation command does not mean all mutants were killed: survivors are a result to inspect, while baseline or infrastructure failure makes the command exit unsuccessfully.

## Initial assessment: 26 October 2026

The unchanged sixteen-test baseline passed. **31 of 40 mutants were killed (77.5%)**, with **9 survivors**, **0 invalid mutants**, **0 timeouts** and **0 runner errors**. Backend and test fingerprints were unchanged after execution. This is the initial targeted result, not a score for an expanded test suite.

The tests detected defects in PIN checks, role separation, logout revocation, username uniqueness, order confirmation/pricing, minimum ingredient guards, payment rechecks, declined/duplicate payments, order ownership, stock/bin accounting, selective disposal/refills, fault handling, diagnostic logging and persistence. The surviving changes expose the following specific gaps:

| Survivor | Missing behavior to test | Suggested meaningful follow-up |
|---|---|---|
| M05 | Session expiry | Capture a valid cookie, move its stored expiration into the past, and assert protected access returns 401 before performing another login. |
| M06 | Rotation of the old login session | Capture the first cookie, log in again in the same browser session, then replay the first cookie and require 401 while the new cookie still works. |
| M13 | Enough for minimum, insufficient for recipe | Set milk to 150 ml: it exceeds the 100 ml minimum but cannot prepare a 200 ml Latte. Require a 409 at selection and payment of an already pending Latte, with no consumption. |
| M28 | Remaining capacity for the next preparation | Set grounds to 85 g of a 90 g bin. An 18 g coffee must be rejected before the bin is full; independent Tea should remain available. Assert a readable selection error, rather than relying on SQLite to reject a later overflow. |
| M32 | Low-stock warning boundary | At coffee's 36 g (20%) boundary require a warning; at 37 g require no low-stock warning, with no other faults active. |
| M33 | Nearly-full warning boundary | Set grounds to 72 g (80% of 90 g) and require a nearly-full warning; check 71 g separately. Full-bin tests do not establish this early warning. |
| M34 | Nutritional content, rather than numeric types only | Assert approved seed nutritional values for representative drinks, including nonzero calories. The current checks only require fields to be numeric, so all-zero data passes. |
| M35 | Displayed versus charged prices | Read the chosen menu price, confirm the order and require its calculated price to match the published price. The current checks validate positive menu prices and a separate correct order price without comparing them. |
| M40 | Rollback after a partial payment failure | In an isolated test database, install a temporary bin-update trigger using SQLite RAISE(FAIL) so the failure occurs after ingredient updates. Require the error response and unchanged ingredient/bin/order snapshots, then remove the trigger and retry. Declines rejected before any mutation do not prove atomic rollback. |

These survivors are actionable behavioral differences, not automatically equivalent changes. The current tests provide useful protection of the core flows, but stronger boundary, content-consistency, session-lifecycle and injected-failure tests are needed before making broad claims about robustness. No follow-up tests were added during this assessment.

## Strengthened suite

After the initial report was archived, nine documented regression tests were added for all nine identified gaps. They test expired and rotated cookies, recipe quantities independently of minimums, next-drink bin capacity, both warning boundaries, full nutritional values, price agreement and actual transaction rollback after an injected SQLite write failure. The last case also removes the injected failure and verifies that the original pending order can be paid successfully on retry.

The strengthened baseline has twenty-five passing tests. The full follow-up run killed **40/40 mutants (100%)**, with **0 survivors**, **0 invalid mutants**, **0 timeouts** and **0 runner errors**. The real backend/test fingerprints were unchanged during the run. Its complete forty-mutant results are in the top-level report files; the initial report, TAP logs and original test source remain in `reports/mutation/initial/`. A selected-mutant score still does not establish exhaustive correctness or browser-level coverage.
