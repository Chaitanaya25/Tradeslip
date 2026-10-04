import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF renderer loads the Inter font files from /public/fonts at runtime, so make sure
  // they are shipped with the two PDF routes in production builds.
  outputFileTracingIncludes: {
    "/api/pdf/quote/[id]": ["./public/fonts/**/*"],
    "/q/[token]/pdf": ["./public/fonts/**/*"],
  },
};

export default nextConfig;
