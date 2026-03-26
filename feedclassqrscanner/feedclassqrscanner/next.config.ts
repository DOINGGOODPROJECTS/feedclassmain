import path from "path";
import dotenv from "dotenv";
import type { NextConfig } from "next";

dotenv.config({
  path: path.resolve(__dirname, "..", ".env.local"),
});

const appRoot = __dirname;

const nextConfig: NextConfig = {
  output: "export",
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
  },
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
    NEXT_PUBLIC_SCANNER_API_TOKEN: process.env.NEXT_PUBLIC_SCANNER_API_TOKEN,
    NEXT_PUBLIC_SCANNER_EMAIL: process.env.NEXT_PUBLIC_SCANNER_EMAIL,
    NEXT_PUBLIC_SCANNER_PASSWORD: process.env.NEXT_PUBLIC_SCANNER_PASSWORD,
  },
};

export default nextConfig;
