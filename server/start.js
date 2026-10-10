const api = require("./api");
require("./config");
require("./runtime");
require("./http/routes");
require("./rooms/state");
require("./money/ledger");
require("./timers");
require("./deploy/handoff");
require("./sockets/handlers");

async function startServer() {
  await api.loadRooms();
  api.markStateRestored(true);
  await api.setupHandoffSubscription();

  process.once("SIGINT", () => {
    api.gracefulShutdown("SIGINT").catch((error) => {
      console.error(error);
      process.exit(1);
    });
  });
  process.once("SIGTERM", () => {
    api.gracefulShutdown("SIGTERM").catch((error) => {
      console.error(error);
      process.exit(1);
    });
  });

  await new Promise((resolve) => {
    api.server.listen(api.PORT, () => {
      api.markServerListening(true);
      console.log(`holdem.nyc listening on http://localhost:${api.PORT} (build ${api.BUILD_ID})`);
      resolve();
    });
  });
}

Object.assign(api, { startServer });
module.exports = { startServer };
