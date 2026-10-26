# Task B — Selected scope and traceability

Source: `requirements/comparison_shortlist.json`, the finalized baseline-shaped Task A artifact. This prototype implements the selected ten functionalities, rather than all thirty requirements in that artifact. Existing Task A files are unchanged.

| # | Selected functionality | Relevant Task A requirements | Implemented acceptance behavior |
|---|---|---|---|
| 1 | Create account | R1 | Username/PIN registration, unique case-insensitive usernames, duplicate rejection, persistent accounts. |
| 2 | Login | R3 | Username/PIN and simulated linked NFC login, invalid-authentication rejection, safe identity response, logout and session revocation. |
| 3 | View beverage options | R4 | Five seeded drinks, category browsing, SEK prices, ingredient inspection and current availability. |
| 4 | Inspect nutritional values | R5 | Expandable per-serving nutrition for every drink. |
| 5 | Place order | R6, R27, R30 | Customer authentication, explicit confirmation of server-priced order, required-stock/minimum/readiness checks and persisted pending checkout. |
| 6 | Pay for order | R7; R6 coordination | Local simulation of EMV chip, contactless card, Apple Pay, Google Pay and employee-card methods; explicit decline/acceptance, ownership checks, guarded immediate preparation, atomic stock/bin/order update, duplicate rejection. |
| 7 | Enter admin mode | R8, R23 | Separate technician PIN authentication, protected HTML and APIs, logout revocation and normal-user access denial. Technician PIN is one allowed R8 authentication alternative. |
| 8 | Register waste disposal | R9, R17, R18 | Separate liquid/grounds bin readings, physical-emptying confirmation and selected-bin reset to zero. Disposal does not clear hardware faults or bypass other conditions. |
| 9 | Monitor system | R10, R17; local diagnostic facet of R19 | Healthy and fault status, low-stock/high-bin warnings, Ready/Limited/Blocked display, local diagnostic events, simulated grinder/heater signals and five-second refresh. |
| 10 | Update ingredient levels | R11 | Authorized confirmation of physical full refill; selected counter restored to configured maximum, unrelated counters unchanged. |

## Scope decisions

- Simulated NFC is an authentication path within Login. A unique linked identifier is generated with each account; card enrollment management is not an added feature. The identifier is displayed on registration and after customer login for demonstration.
- Hardware fault controls belong to Monitor system and provide deterministic inputs for showing warnings and readiness guards. There is no general machine-configuration editor.
- Only manual fixed-recipe ordering is enabled. All enabled paths, including both credential and NFC customer sessions, use the same backend guards. Saved-recipe, recommendation and natural-language ordering are not implemented. R30 is applied to enabled ordering, without claiming those other paths exist.
- R18's bin-independence exception is modeled explicitly: coffee drinks use liquid and grounds bins; Tea and Hot Chocolate use only liquid. Full grounds blocks coffee but permits verified-independent drinks. Unknown or missing bin mappings block preparation; full/insufficient-capacity checks prevent actual overflow. The prototype does not claim hardware certification of these mappings.
- Payment and preparation are synchronous local simulations. No funds move, no card details are collected, and no external payment processor or digital wallet SDK is contacted. Only accepted payment can prepare a drink. Offline settlement/reconciliation is outside the selected scope.
- Orders store a fixed execution recipe snapshot as support for ordering/payment. This is not an added order-history UI, customization workflow or recommendation feature.
- Nutritional values and prices are seed data. No nutritional accuracy assessment, allergen policy or live ingredient database is claimed.
- Fixed PIN rules, thresholds, capacities, prices and refresh intervals are explicit prototype assumptions recorded in README and seed code. R11's original-value refill is interpreted as restoration to configured full capacity after physical refill.
- The broader R4 category/ingredient behavior is included. Separate physical-key/NFC-master maintenance variants, external remote diagnostics, receipts, recipe editing/saving/deletion, preference maintenance, recommendations, mood analysis and language agents are outside the selected ten functions.

## Demonstration evidence

`npm.cmd run check` checks JavaScript syntax. `npm.cmd test` executes twenty-five HTTP/database integration tests. Nine regression cases were added after an initial mutation assessment identified gaps; the earlier sixteen-test report is preserved under `reports/mutation/initial/`. The README provides one user-facing demonstration procedure per selected function. The normal start command is checked separately. Visual browser verification is not available in this execution environment; manual Edge testing on the demonstration Windows machine remains appropriate.

## Generation documentation

`task-b-conversation.txt` records the available selection/clarification prompts, implementation brief and response summaries. Save the full generation chat export with the submission because the assignment asks for the conversation when code is generated. Record the actual model/version label used in the application; an exact externally verifiable model version is not supplied by the requirement files and is not invented here.
