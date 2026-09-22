import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/captacao-automatizada/conversoes/*/relatorio': ['./public/templates/genske-papel-timbrado.pdf'],
  },
  experimental: {
    cpus: 2,
    staticGenerationMaxConcurrency: 4,
    staticGenerationMinPagesPerWorker: 2,
  },
}

export default nextConfig
