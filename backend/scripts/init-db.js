const { closeDatabase } = require("../src/db/connection");
const { getDatabaseStatus, initializeDatabase } = require("../src/db/init");

async function main() {
  await initializeDatabase();
  const status = await getDatabaseStatus();
  console.log(
    JSON.stringify(
      {
        ready: status.ready,
        databasePath: status.databasePath,
        missingTables: status.missingTables,
        tables: status.tables,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Failed to initialize database schema");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
