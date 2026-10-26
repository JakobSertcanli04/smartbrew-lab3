# SmartBrew mutation assessment

Generated: 2026-10-26T18:45:55.524Z. Node: v24.16.0.

Baseline: **passed**. Existing tests were not strengthened for this assessment.

**31 killed / 40 assessed mutants = 77.5% mutation score.**

9 survived; 0 invalid; 0 timed out; 0 runner errors. Invalid/timeout/error outcomes are excluded from the score and shown separately.

A killed mutant made at least one test fail. A survivor passed the unchanged suite and needs review. These are 40 hand-selected backend mutations, not exhaustive automated mutation coverage; the score is specific to this set. It does not measure browser rendering, usability or all possible defects. No survivors are automatically declared equivalent.

Selection: all 40 mutants. Source/test fingerprints unchanged: **true**.

Run again: `npm.cmd run test:mutation`. List definitions: `npm.cmd run test:mutation -- --list`. Run a subset: `npm.cmd run test:mutation -- --only M05,M13`. Subset runs replace these reports and identify their selection.

| ID | Deliberate defect | Result | Failing test evidence |
|---|---|---|---|
| M01 | Accept an incorrect customer PIN | killed | username/PIN and simulated NFC login reject invalid input; logout revokes replayed sessions |
| M02 | Accept an incorrect technician PIN | killed | admin HTML, status and all maintenance actions require separate authentication; logout revokes admin |
| M03 | Remove role separation after authentication | killed | admin HTML, status and all maintenance actions require separate authentication; logout revokes admin |
| M04 | Do not revoke the server session on logout | killed | username/PIN and simulated NFC login reject invalid input; logout revokes replayed sessions; admin HTML, status and all maintenance actions require separate authentication; logout revokes admin |
| M05 | Allow expired sessions | survived | No failing test |
| M06 | Keep the old session after a new login | survived | No failing test |
| M07 | Skip duplicate-username validation | killed | registration validates input, rejects duplicate names and stores salted hashes |
| M08 | Make usernames case sensitive | killed | registration validates input, rejects duplicate names and stores salted hashes |
| M09 | Allow a two-character username | killed | registration validates input, rejects duplicate names and stores salted hashes |
| M10 | Do not require explicit order confirmation | killed | ordering requires a customer, explicit confirmation and a server-calculated price |
| M11 | Trust a customer-supplied order price | killed | ordering requires a customer, explicit confirmation and a server-calculated price |
| M12 | Ignore ingredient minimum thresholds | killed | below-minimum ingredients block selection and payment of a previously pending order |
| M13 | Ignore the recipe quantity when minimum stock is present | survived | No failing test |
| M14 | Reject stock exactly equal to the minimum | killed | competing payments cannot oversell the last recipe worth of coffee |
| M15 | Skip availability checks when placing an order | killed | below-minimum ingredients block selection and payment of a previously pending order; full grounds bin blocks coffee while verified independent tea remains available; disposal resets only selected bin |
| M16 | Skip availability recheck at payment | killed | below-minimum ingredients block selection and payment of a previously pending order; competing payments cannot oversell the last recipe worth of coffee |
| M17 | Treat declined payment as accepted | killed | declined and malformed payments never consume ingredients and allow valid retry |
| M18 | Allow an order to be paid twice | killed | accepted payment consumes the fixed recipe and increments only dependent bins exactly once |
| M19 | Allow payment of another customer’s order | killed | customers cannot read or pay another customer’s pending order |
| M20 | Expose another customer’s pending orders | killed | customers cannot read or pay another customer’s pending order |
| M21 | Leave an accepted order pending | killed | accepted payment consumes the fixed recipe and increments only dependent bins exactly once; accounts, sessions, orders, supplies and events persist across database reopening |
| M22 | Do not consume ingredients on successful payment | killed | accepted payment consumes the fixed recipe and increments only dependent bins exactly once; competing payments cannot oversell the last recipe worth of coffee; accounts, sessions, orders, supplies and events persist across database reopening |
| M23 | Do not increase the coffee-ground counter | killed | accepted payment consumes the fixed recipe and increments only dependent bins exactly once; competing payments cannot oversell the last recipe worth of coffee; accounts, sessions, orders, supplies and events persist across database reopening |
| M24 | Disposal resets every bin | killed | full grounds bin blocks coffee while verified independent tea remains available; disposal resets only selected bin |
| M25 | Refill resets every ingredient | killed | refill resets one ingredient to maximum and requires physical-refill confirmation |
| M26 | Skip physical-emptying confirmation | killed | full grounds bin blocks coffee while verified independent tea remains available; disposal resets only selected bin |
| M27 | Skip physical-refill confirmation | killed | refill resets one ingredient to maximum and requires physical-refill confirmation |
| M28 | Ignore waste capacity needed by the next drink | survived | No failing test |
| M29 | Block independent drinks when the grounds bin is full | killed | full grounds bin blocks coffee while verified independent tea remains available; disposal resets only selected bin |
| M30 | Let a grinder fault block every drink | killed | monitoring shows healthy state, selective fault blocks, global heater block, warnings and diagnostic events |
| M31 | Ignore heater readiness faults | killed | monitoring shows healthy state, selective fault blocks, global heater block, warnings and diagnostic events |
| M32 | Warn about low stock only at 10 percent | survived | No failing test |
| M33 | Do not warn about a bin until it is full | survived | No failing test |
| M34 | Display zero for every nutritional value | survived | No failing test |
| M35 | Display a menu price different from the charged price | survived | No failing test |
| M36 | Accept any syntactically valid NFC ID | killed | username/PIN and simulated NFC login reject invalid input; logout revokes replayed sessions |
| M37 | Report Ready when only some drinks are available | killed | full grounds bin blocks coffee while verified independent tea remains available; disposal resets only selected bin; monitoring shows healthy state, selective fault blocks, global heater block, warnings and diagnostic events |
| M38 | Drop diagnostic events | killed | monitoring shows healthy state, selective fault blocks, global heater block, warnings and diagnostic events; accounts, sessions, orders, supplies and events persist across database reopening |
| M39 | Restore all ingredients on every restart | killed | accounts, sessions, orders, supplies and events persist across database reopening |
| M40 | Commit a failed payment instead of rolling it back | survived | No failing test |

## Review survivors

The original mutation definitions (exact before/after snippets) are in mutation/mutants.cjs and the JSON report. Suggested additional tests should be derived from the survivor behavior, then run as a separate follow-up assessment so the initial baseline result remains distinguishable.
