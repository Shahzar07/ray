import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },
  serverExternalPackages: ["pg", "bcryptjs"],
  typedRoutes: false,
};

export default nextConfig;
