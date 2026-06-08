import type { NextConfig } from 'next';
import createMDX from '@next/mdx';
import remarkGfm from 'remark-gfm';

// Log config source at startup
const isDoppler = !!process.env.DOPPLER_PROJECT;
const configSource = isDoppler
  ? `Doppler (${process.env.DOPPLER_PROJECT}/${process.env.DOPPLER_CONFIG})`
  : '.env files';
const publicVarCount = Object.keys(process.env).filter((k) => k.startsWith('NEXT_PUBLIC_')).length;
console.log(
  `[Config] Source: ${configSource} | ${publicVarCount} NEXT_PUBLIC_* vars loaded`,
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  transpilePackages: ['@app/ui'],
};

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [remarkGfm],
  },
});

export default withMDX(nextConfig);
