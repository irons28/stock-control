const { closeDatabase } = require("../src/db/connection");
const { resetDatabase } = require("../src/db/init");

async function main() {
  const status = await resetDatabase({ seed: true });
  console.log(
    JSON.stringify(
      {
        ready: status.ready,
        databasePath: status.databasePath,
        missingTables: status.missingTables,
        tables: status.tables,
        serialStatusCounts: status.serialStatusCounts,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Failed to reset and seed database");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
