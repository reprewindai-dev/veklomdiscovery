import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  experimental: {
    cpus: 1,
    workerThreads: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
