import api = require("./server/index");

if (require.main === module) {
  api.startServer().catch((error: unknown) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}

export = api;
