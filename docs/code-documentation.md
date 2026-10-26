# Source documentation

Every project-defined JavaScript function and callback documents:

1. Its purpose.
2. Its expected input parameters, including optional/default values where applicable. Functions without parameters say so and identify any relevant captured state.
3. Its return value or observable output, including JSON/HTML responses, database or interface changes, and promise rejection when relevant.

Named functions use adjacent JSDoc blocks. Inline callbacks have a block immediately before the callback expression; the returned test request callback has its block before `return async` to preserve JavaScript return semantics. HTTP route comments distinguish the request/response parameters from the JSON body, identity and URL parameters carried by the request. Asynchronous functions document their promise result. Express response helpers and side effects are distinguished from JavaScript return values.

| Source file | Named functions | Callback functions | Coverage |
|---|---:|---:|---|
| `server.js` | 3 | 0 | Startup and graceful shutdown |
| `src/database.js` | 3 | 0 | Database initialization and PIN hashing/verification |
| `src/app.js` | 12 | 19 | Middleware, route handlers, guards and data transformations |
| `public/app.js` | 14 | 16 | API calls, rendering, form/click handlers and asynchronous callbacks |
| `test/app.test.js` | 7 | 34 | Test fixtures, cleanup, request helpers, assertions, twenty-five test bodies and injected-error logging |
| `mutation/run.cjs` | 7 | 0 | Mutation copying, baseline checks, execution, reporting and safe cleanup |
| **Total** | **46** | **69** | **115 functions and callbacks** |

HTML, CSS and JavaScript files also have file-level comments explaining their roles. Third-party dependency source in `node_modules` is not project-authored code and is not edited.

The documentation update preserves the application logic. JavaScript syntax checks and all twenty-five integration tests verify the resulting source. Future additions should follow the same purpose/input/output convention.
