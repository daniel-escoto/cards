import api = require("./api");
import "./config";
import "./runtime";
import "./http/routes";
import "./rooms/state";
import "./money/ledger";
import "./timers";
import "./deploy/handoff";
import "./sockets/handlers";

async function startServer(): Promise<void> {
  await api.loadRooms();
  api.markStateRestored(true);
  await api.setupHandoffSubscription();

  process.once("SIGINT", () => {
    api.gracefulShutdown("SIGINT").catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
  });
  process.once("SIGTERM", () => {
    api.gracefulShutdown("SIGTERM").catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
  });

  await new Promise<void>((resolve) => {
    api.server.listen(api.PORT, () => {
      api.markServerListening(true);
      console.log(`holdem.nyc listening on http://localhost:${api.PORT} (build ${api.BUILD_ID})`);
      resolve();
    });
  });
}

Object.assign(api, { startServer });
export = { startServer };
