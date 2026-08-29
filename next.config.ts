import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
    serverActions: {
      /* A 5,000-row sheet posts as ~1 MB of JSON; the default cap is 1 MB. */
      bodySizeLimit: "8mb",
    },
  },
  serverExternalPackages: ["pg", "bcryptjs"],
  typedRoutes: false,
};

export default nextConfig;
