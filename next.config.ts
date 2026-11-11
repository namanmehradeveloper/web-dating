import type { NextConfig } from 'next';

// Browser clients call the Express API directly via NEXT_PUBLIC_API_URL (axios).
// No Next.js rewrites / proxy to the backend.
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
