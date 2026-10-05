import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/captacao-automatizada/conversoes/*/relatorio': ['./public/templates/genske-papel-timbrado.pdf'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '4.5mb',
    },
    cpus: 2,
    staticGenerationMaxConcurrency: 4,
    staticGenerationMinPagesPerWorker: 2,
  },
}

export default nextConfig
