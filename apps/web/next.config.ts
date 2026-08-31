import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@pri/ai", "@pri/db", "@pri/domain", "@pri/recommendation"],
};

export default nextConfig;
