const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config();

const env = {
  host: process.env.HOST || "127.0.0.1",
  port: Number.parseInt(process.env.PORT || "4000", 10),
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  databasePath:
    process.env.DATABASE_PATH || path.resolve(__dirname, "../../data/stock-control.sqlite"),
};

module.exports = {
  env,
};
