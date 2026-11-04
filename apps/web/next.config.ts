import type { NextConfig } from 'next';

const backend = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/v1/auth/:path*', destination: `${backend}/api/v1/auth/:path*` }];
  },
};

export default nextConfig;
