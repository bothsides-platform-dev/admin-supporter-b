import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/admin/review', destination: '/review', permanent: true },
      { source: '/admin/review/:id', destination: '/review/:id', permanent: true },
    ];
  },
  serverExternalPackages: ['pino', 'pino-pretty'],
};

export default nextConfig;
