import type { NextConfig } from 'next';

const backend = (process.env.BACKEND_ORIGIN || 'http://127.0.0.1:5050').replace(/\/$/, '');
const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${backend}/api/v1/:path*` },
      { source: '/uploads/:path*', destination: `${backend}/uploads/:path*` },
    ];
  },
};
export default nextConfig;
