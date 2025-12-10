import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Ökar gränsen till 10MB
    },
  },
};

export default nextConfig;