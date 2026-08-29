import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@pri/db", "@pri/domain"],
};

export default nextConfig;
