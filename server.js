const api = require("./server/index");

if (require.main === module) {
  api.startServer().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}

module.exports = api;
