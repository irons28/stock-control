const express = require("express");
const cors = require("cors");
const { env } = require("./config/env");
const apiRouter = require("./routes");
const { notFoundHandler, errorHandler } = require("./middleware/error-handler");

const app = express();

app.use(
  cors({
    origin: env.frontendOrigin,
  }),
);
app.use(express.json());

app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
