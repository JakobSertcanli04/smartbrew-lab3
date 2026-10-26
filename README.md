# SmartBrew — Task B prototype

Submission repository: [JakobSertcanli04/smartbrew-lab3](https://github.com/JakobSertcanli04/smartbrew-lab3).

## System overview

A local web application implementing the ten selected SmartBrew functionalities in JavaScript, Express, SQLite, HTML and CSS. It is designed for a Windows 11 classroom demonstration. Payments, NFC taps and hardware signals are simulated locally; the app makes no external API calls and loads no external assets.

The customer interface supports registration, authentication, beverage and ingredient browsing, nutritional inspection, confirmed orders and simulated payments. A separately authenticated maintenance dashboard supports waste disposal, system monitoring and ingredient refills. SQLite retains the machine and account state between runs. The selected-feature mapping is in [docs/task-b-scope.md](docs/task-b-scope.md).

## Environment and prerequisites

| Component | Requirement / verified version |
|---|---|
| Operating system | Windows 11; this is the supported demonstration environment. |
| Runtime | Node.js **24 or later**, verified with **24.16.0**. Use 24.16.0 to reproduce the tested environment; `.node-version` records it for compatible version managers. |
| Package manager | npm, included with Node.js; verified with **11.13.0**. Use `npm.cmd` in PowerShell. |
| Server library | Express **5.3.0** in the committed lockfile. `package.json` declares the dependency and `package-lock.json` fixes the installed dependency tree. |
| Database | Node's built-in `node:sqlite`, verified with SQLite **3.53.0** supplied by the tested runtime. No separately installed SQLite package/service is required. |
| Browser | A modern Edge, Chrome or Firefox browser supporting native HTML dialogs, JavaScript and cookies. |
| Installation access | Internet access to npm for the initial dependency installation, unless packages are already cached. Execution needs no internet or external services. |

No separate compiler, frontend build tool, Python, C/C++ toolchain or database server is required. Node built-ins supply cryptography, file access, HTTP utilities and the test runner. HTML/CSS and browser JavaScript are served directly. Development used Node.js 24.16.0 and npm 11.13.0; other versions have not been independently verified.

## Execution guide: setup, check and start

### 1. Install the runtime and obtain the project

Install Node.js 24.16.0 with npm using a Windows installer or your Node version manager. Open a new PowerShell window after installation so the commands are available on PATH.

Clone the submitted Git repository, or download and extract its ZIP. In File Explorer, open the project folder containing **both `package.json` and `package-lock.json`**, then open PowerShell/Terminal in that folder. Your extraction location can be anywhere; the application does not require the author's username or Downloads path.

If Git is installed and your GitHub account has access to the repository:

```powershell
git clone https://github.com/JakobSertcanli04/smartbrew-lab3.git
cd smartbrew-lab3
```

Git is optional when using a downloaded source ZIP. For a private repository, the instructor must accept the collaborator invitation before accessing the source.

If PowerShell is elsewhere, change to the actual extracted directory. Replace the example path below with your own:

```powershell
cd "C:\path\to\smartbrew-lab3"
```

### 2. Verify the environment and project directory

Run:

```powershell
node --version
npm.cmd --version
Get-Item package.json, package-lock.json
```

For the tested environment, the first two commands print `v24.16.0` and `11.13.0`. The last command must find both files. If it does not, navigate into the actual project directory before continuing.

### 3. Install the locked dependencies

```powershell
npm.cmd ci
```

This installs the exact dependency tree in `package-lock.json`. Keep that file with the submission and use `ci` rather than generating a new dependency resolution on the evaluator's machine. A clean checkout does not need `node_modules`, a pre-created database or any global npm application packages.

### 4. Check syntax and run the automated tests

```powershell
npm.cmd run check
npm.cmd test
```

Expected results: the syntax command exits successfully, and the test runner reports **25 passed, 0 failed**. Tests use isolated databases, so a pre-existing demonstration database is not required or changed.

There is **no compilation or frontend build step**. Dependency installation and the checks above prepare the application for execution; no `npm run build` command is needed.

### 5. Start the web server

```powershell
npm.cmd start
```

The terminal should print `SmartBrew is running at http://localhost:3000`. Keep that terminal open while demonstrating the system.

### 6. Open the application and authenticate

Open **http://localhost:3000** in the browser. Create a customer account through the interface; no customer account is pre-seeded. For a repeatable example, use username `demo_user` and personal PIN `1234` on a fresh database. If that name already exists, sign in to it or register another name.

For maintenance, click **Maintenance**, enter the default technician PIN **2468**, then click **Enter admin mode**. The direct maintenance sign-in URL is **http://localhost:3000/admin-login.html**. No maintenance username is required.

Use a normal browser window for the customer and an InPrivate/incognito window for maintenance if demonstrating both at once. Ordinary tabs in one browser profile share a session; maintenance sign-in replaces that profile's customer session.

### 7. Stop the application

Press **Ctrl+C** in the server terminal. The HTTP listener stops and SQLite is closed. Restarting with `npm.cmd start` reuses the saved database.

### Quick commands for the author's existing workspace

These commands apply only when the project is already at the original local path. Evaluators should follow the location-independent steps above.

```powershell
cd C:\Users\jakob\Downloads\lab3\smartbrew-lab3
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd start
```

## Troubleshooting

- **`node` or `npm.cmd` not recognized:** install Node.js with npm and reopen the terminal. Check PATH if the commands remain unavailable.
- **PowerShell blocks `npm.ps1`:** use the documented `npm.cmd` commands; changing the system execution policy is unnecessary.
- **ENOENT / missing `package.json`:** PowerShell is in the wrong directory. Use `Get-Item package.json` to confirm the project root.
- **SQLite unavailable:** check `node --version` and use the documented Node 24 runtime. Installing a separate SQLite CLI will not add Node's built-in module to an older Node version.
- **`npm ci` fails:** check registry/network access and ensure both package files came from the same checkout. Preserve the supplied lockfile rather than deleting it to bypass a mismatch.
- **Database cannot be created:** run from a writable extracted directory, or configure `DB_PATH` to a writable location. Do not run directly inside a ZIP archive.
- **Admin sign-in succeeds but `/admin` returns 404:** extract the project into a normal directory whose path has no dot-prefixed hidden directory segments. Express deliberately hides files in those paths.
- **Login expires:** sessions last eight hours; sign in again. Maintenance and customer access are separate roles.
- **A drink is unavailable:** inspect maintenance stock, bin levels and hardware warnings. Register the appropriate refill/disposal or clear the simulated fault, then refresh the menu.

The server binds to `127.0.0.1` on the demonstration computer. If port 3000 is occupied, stop any owned prior instance or choose another port:

```powershell
$env:PORT = "3001"
npm.cmd start
```

Then use the printed URL. Some Node versions show an experimental SQLite warning; that warning does not prevent the prototype from running.

## Manual tests: demonstrate all ten functionalities

Follow these GUI steps after startup. Check the expected result for each functionality; the automated tests also exercise these operations and their failure cases.

| # | Functionality | GUI steps | Expected result |
|---|---|---|---|
| 1 | Create account | Expand **Create an account**, enter a 3–24 character username and 4–8 digit PIN, and submit. Try the same username again. | First registration succeeds and issues a simulated card ID; the duplicate is rejected, including a change in letter case. |
| 2 | Login | Try a wrong PIN, then the correct username/PIN. Note the simulated card ID shown after login. Log out, expand **Use a simulated NFC card**, and enter that ID. | Wrong credentials are rejected; valid credentials and the linked simulated card authenticate the matching customer. Logout revokes access. |
| 3 | View beverage options | Browse **All drinks**, **Coffee**, and **Tea & chocolate**. Use **Refresh menu** after a maintenance change in another browser session. | Correct categories, beverage names, SEK prices, ingredient quantities and current availability appear. |
| 4 | Inspect nutritional values | Expand **Nutritional values** on each drink. | Energy, protein, carbohydrates, sugars and fat appear per serving. Values are approximate demonstration data. |
| 5 | Place order | Log in as a customer, click **Place order**, inspect the beverage and calculated amount, then click **Confirm order**. | A confirmed, unpaid order appears in checkout. Missing confirmation, unavailable stock or blocking machine conditions prevent an invalid order. |
| 6 | Pay for order | Choose a simulated payment method. Click **Simulate declined payment**, then retry with **Simulate accepted payment**. Refresh maintenance readings. | A decline leaves the order unpaid without consumption. Acceptance prepares the drink, removes it from pending checkout, reduces its ingredient levels and increases the relevant bin levels once. |
| 7 | Enter admin mode | Open **Maintenance**, try an incorrect technician PIN, then enter **2468**. Log out and try visiting `/admin` directly. | Wrong credentials fail; the correct technician PIN grants maintenance access. After logout, the protected page requires authentication again. |
| 8 | Register waste disposal | After preparing a drink, view its bin readings in maintenance. Click **Register emptying** for one bin and confirm physical emptying in the simulation. | Only the selected bin resets to zero; the other bin retains its current level. |
| 9 | Monitor system | View readings, warnings and state. Use **Simulate fault** for the grinder and heater, refresh the customer menu, then clear the faults. | Fault messages and diagnostic events appear. Grinder failure blocks coffee; heater failure blocks all seeded drinks. Clearing faults restores readiness only if other guards pass. |
| 10 | Update ingredient levels | After a drink consumes supplies, click **Refill to max** for a selected ingredient and confirm full physical refill in the simulation. | That ingredient returns to its configured capacity; unrelated ingredient counters do not change. |

All seeded beverages—Espresso, Cappuccino, Latte, Tea and Hot Chocolate—have ingredient recipes, fixed prices and nutritional values.

Customer and admin pages share logout, but their authentication paths and permissions are separate. Direct access to `/admin` or maintenance APIs is rejected without the admin session. Refresh the maintenance page or use **Refresh readings** to compare levels before and after customer actions.

## Machine simulation rules

- Stock is checked against both the recipe quantity and configured minimum level at **selection and payment**. Creating an order does not reserve or consume supplies. The server controls prices, confirmed orders and recipe quantities.
- Five coffee preparations fill the 90 g grounds bin (18 g each). Further coffee is blocked; Tea and Hot Chocolate remain eligible if their supplies and liquid-waste capacity permit. Their configured waste maps do not use the grounds bin.
- Every drink uses liquid waste. A full liquid bin blocks every seeded drink. A drink is also blocked when its next preparation would exceed bin capacity. The simulation prevents overflow rather than intentionally causing a spill.
- A grinder fault blocks coffee drinks; a heater fault blocks all seeded drinks. Clearing a fault never bypasses another active fault, stock block or bin block.
- Stock warns at 20% of maximum or below, or below its minimum. Bins warn at 80% capacity. These are documented demonstration choices, not numerical targets supplied by Task A.
- **Ready** means all five drinks can be prepared; **Limited** means some can; **Blocked** means none can. Healthy status is visible without needing to trigger an error.
- Admin readings refresh every five seconds, with a manual refresh button. Local event entries record faults, maintenance and warning conditions. This implements monitoring and local authorized diagnostics; it does not integrate an external remote-diagnostics service.
- On accepted payment, recipe consumption, both relevant waste increments, diagnostic warnings and order status commit in one SQLite transaction. A decline or failed guard leaves them unchanged. Each completed order stores its fixed recipe snapshot; there is no separate customer history/recommendation feature.

For an ingredient-threshold demonstration, buy five Lattes, then empty the grounds bin: milk has reached zero, so milk drinks remain blocked until its full refill is registered. Tea and Espresso can still be selected if their other guards pass.

## Persistence and configuration

First startup creates and seeds **`data/smartbrew.sqlite`**. Accounts, sessions, orders, ingredient levels, bin levels, faults and events persist across restarts. Seeding never restores used supplies. PINs are stored as salted scrypt hashes; session tokens are random, hashed in SQLite, and sent in HttpOnly/SameSite Strict cookies. Sessions expire after eight hours.

Optional PowerShell settings, before starting:

```powershell
$env:DB_PATH = "data/another-demo.sqlite"
$env:ADMIN_PIN = "8642"
npm.cmd start
```

`ADMIN_PIN` is only applied when initializing a database without an administrator PIN. It must contain 4–8 digits. Setting it later does not replace an existing stored PIN. The documented default PIN is a local classroom credential. Use another DB_PATH for a fresh independent demonstration without deleting existing data.

## Automated tests and verification limits

```powershell
npm.cmd run check
npm.cmd test
```

The **25 integration tests** use isolated in-memory or temporary databases and real HTTP requests. They cover registration and uniqueness, PIN/NFC authentication, session revocation and expiry/rotation, prices/nutrition, confirmation, simulated methods and outcomes, stock/waste updates, private orders, admin protection, threshold and remaining-capacity boundaries, independent bins, refills, faults/logging, competing payments, persistence and malformed requests. Added regression cases verify actual nutritional data, displayed/charged price agreement, exact warning boundaries and rollback after an injected mid-payment write failure. Tests do not change the demonstration database. `check` verifies JavaScript syntax.

The documented checks and normal startup were verified in the development environment. The original sixteen-test version also passed a separate clean-folder installation from the lockfile, without an existing database or `node_modules`. Nine regression tests were then added after mutation testing. The mutation assessment runs the current twenty-five-test suite in independent copies. Installation reused the npm download cache; first-time installation on another machine still needs npm registry access. Visual browser interaction was not available for automated verification; perform the manual GUI checks above in the browser on the independent evaluation machine.

## Mutation testing: assess the strength of the tests

```powershell
npm.cmd run test:mutation
```

This runs the unchanged baseline first, then tests **40 deliberately broken backend variants**, one change at a time. It covers authentication, authorization, sessions, order confirmation/pricing, stock checks, payment outcomes, stock/bin updates, maintenance, warnings, nutrition and persistence. It adds no external dependencies. Allow several minutes for the full run.

The runner creates temporary application copies, uses isolated test databases and reuses installed dependency packages. It never rewrites the real application or opens its demonstration database. Each run has a 30-second per-suite timeout; real source/test fingerprints are checked afterward. No test assertions are added or weakened for the assessment.

- **Killed:** at least one test fails with the deliberate defect.
- **Survived:** all existing tests still pass; inspect this potential coverage gap.
- **Invalid / error / timeout:** reported separately and excluded from the numeric score.

The mutation score is `killed / (killed + survived) × 100`. It applies to this hand-selected backend mutant set, rather than every possible defect or frontend interaction. Survivors are not automatically dismissed as equivalent behavior. The initial sixteen-test score of **31/40 (77.5%)** and original test source are preserved in `reports/mutation/initial/`. After adding nine regression cases, the twenty-five-test suite caught **40/40 mutants (100%)**, with zero survivors, invalid mutants, timeouts or runner errors. This targeted result is not proof that every possible defect is covered.

Read [the generated assessment](reports/mutation/report.md), [machine-readable results](reports/mutation/report.json) and exact definitions in `mutation/mutants.cjs`. Full TAP outputs are generated in `reports/mutation/logs/` and excluded from Git. Running a subset replaces the summary reports and clearly labels its selection:

```powershell
npm.cmd run test:mutation -- --list
npm.cmd run test:mutation -- --only M05,M13
```

The command exits unsuccessfully for a failing baseline or infrastructure problems. Survivors alone do not make the command fail; inspect the report. Keep the initial assessment if adding tests later, so the before/after results can be compared honestly.

## Packaging and independent evaluation

Include `package.json`, `package-lock.json`, `.node-version`, application source, tests and documentation in the submitted repository or source ZIP. Exclude `node_modules`, `.npm-cache` and personal runtime SQLite data; `.gitignore` already excludes them. The evaluator installs dependencies with `npm.cmd ci`, and first startup creates the database and seeds automatically. No file path in the application depends on the original author's home directory.

The prototype implements the selected ten functionalities. Physical devices, actual card processing and external services are simulated; customization/saved recipes, recommendations, receipts and other unselected features are outside its scope. See [the scope mapping](docs/task-b-scope.md) for the boundaries. Exact testing-platform portability beyond Windows 11 is not claimed.

## Project structure

```text
server.js                       Local listener and shutdown
package.json                    Dependency declarations and run/check/test scripts
package-lock.json               Exact resolved dependency tree for npm ci
.node-version                   Tested Node.js version for compatible version managers
src/app.js                      Routes, guards, authentication and payment
src/database.js                 SQLite schema, seeds and PIN hashing
public/index.html               Menu, registration/login, confirmation, checkout
public/admin-login.html         Separate maintenance sign-in
public/app.js                   Frontend event handlers and local API calls
public/styles.css               Responsive styling
views/admin.html                HTML protected by admin authentication
data/smartbrew.sqlite           Created on startup; ignored runtime state
test/app.test.js                HTTP and persistence integration tests
mutation/mutants.cjs            Forty deliberate backend defect definitions
mutation/run.cjs                Isolated mutation runner with baseline and timeouts
reports/mutation/report.md      Generated mutation assessment
reports/mutation/report.json    Machine-readable mutation evidence
docs/task-b-scope.md            Ten-feature mapping and scope decisions
docs/task-b-conversation.txt    Available Task B prompt/conversation record
docs/prompts-and-strategy.txt   Edited prompt record and prompting strategy
```

Every project-defined JavaScript function and callback has a documentation comment describing its purpose, expected parameters (or explicitly no parameters), and return value or observable output. This includes route handlers, event handlers, rendering callbacks and test callbacks. See [the documentation guide](docs/code-documentation.md) for coverage and conventions, [the scope mapping](docs/task-b-scope.md) for exact Task A IDs and prototype boundaries, and [the conversation record](docs/task-b-conversation.txt) for generation prompts available in this session. Preserve the full chat export separately for submission.

This repository contains the executable prototype, tests, mutation definitions/results and supporting documentation. Task A source files, comparison drafts and assignment copies are not included in the current project tree. Historical source references in the prompt record describe the earlier requirements work; they are not runtime dependencies. Keep any Task A report/artifacts separately for the assignment's Canvas submission.
