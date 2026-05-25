import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    cpus: 2,
    staticGenerationMaxConcurrency: 4,
    staticGenerationMinPagesPerWorker: 2,
  },
}

export default nextConfig
