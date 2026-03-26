const path = require("path");
const dotenv = require("dotenv");

let loaded = false;

function loadEnv() {
  if (loaded) return;

  dotenv.config({
    path: path.resolve(process.cwd(), ".env.local"),
  });

  loaded = true;
}

module.exports = { loadEnv };
