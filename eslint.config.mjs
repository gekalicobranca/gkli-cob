import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

export default [
  { ignores: ['.next/**', 'node_modules/**', 'dist/**', 'out/**', 'tsconfig.tsbuildinfo'] },
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'import/no-anonymous-default-export': 'off',
    },
  },
]
