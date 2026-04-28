const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { env } = require("../config/env");

const databasePath = path.isAbsolute(env.databasePath)
  ? env.databasePath
  : path.resolve(__dirname, "../../", env.databasePath);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new sqlite3.Database(databasePath);

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

module.exports = {
  db,
  get,
  databasePath,
};
