/** @file Starts the loopback HTTP server and closes its SQLite connection on shutdown. */
const { createApp } = require('./src/app');
const app = createApp({ dbPath: process.env.DB_PATH, adminPin: process.env.ADMIN_PIN });
const port = Number(process.env.PORT || 3000);

/**
 * Report startup using the initialized HTTP server.
 * Input parameters: none; reads the enclosing server listener.
 * @returns {void} Prints the actual local URL to the terminal.
 */
function announce() { console.log(`SmartBrew is running at http://localhost:${server.address().port}`); }
const server = app.listen(port, '127.0.0.1', announce);

/**
 * Close persistence after the listener stops.
 * Input parameters: none; reads the enclosing app database connection.
 * @returns {never} Releases SQLite and terminates the process successfully.
 */
function finish() { app.locals.db.close(); process.exit(0); }
/**
 * Stop the owned HTTP server when SIGINT or SIGTERM is received.
 * Input parameters: none; Node invokes this signal listener without arguments.
 * @returns {void} Starts graceful shutdown; finish() releases SQLite when the listener closes.
 */
function shutdown() { server.close(finish); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
