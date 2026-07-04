/** @type {import('next').NextConfig} */

// Hardcoded whitelist of parent origins allowed to embed the chatbot via iframe.
// frame-ancestors expects origins (scheme + host[:port]) — paths are NOT honored by browsers.
// localhost / 127.0.0.1: local parent pages (e.g. AWL dev on :8080); each port is a distinct origin.
// Quick-fix list; move to env-driven config later.
const FRAME_ANCESTORS_WHITELIST = [
  "'self'",
  'https://qa.awl.com.do',
  'https://stg.awl.com.do',
  'https://buho.com.do',
  'https://*.nitrostack.ai',
  'https://*.dev.nitrostack.ai',
  'https://*.stg.nitrostack.ai',
  'https://nitrostack.ai',
  'https://*.nitrocloud.ai',
  'https://*.staging.nitrocloud.ai',
  'https://*.dev.nitrocloud.ai',
  'https://nitrocloud.ai',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].join(' ');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Security headers
  async headers() {
    return [
      // Allow /embed route to be embedded in iframes by whitelisted parent origins
      {
        source: '/embed',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${FRAME_ANCESTORS_WHITELIST}`
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*'
          },
          {
            key: 'Permissions-Policy',
            value: 'microphone=*, camera=(), geolocation=()'
          },
        ],
      },
      // Allow /try-embed route to use microphone (and be embeddable for the in-app demo)
      {
        source: '/try-embed',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${FRAME_ANCESTORS_WHITELIST}`
          },
          {
            key: 'Permissions-Policy',
            value: 'microphone=*, camera=(), geolocation=()'
          },
        ],
      },
      // Root URL is iframe'd by some partners (e.g. ?prompt= on /). Same as /embed: CSP only,
      // never X-Frame-Options (SAMEORIGIN would block qa.awl.com.do et al.).
      {
        source: '/',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${FRAME_ANCESTORS_WHITELIST}`
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*'
          },
          {
            key: 'Permissions-Policy',
            value: 'microphone=*, camera=(), geolocation=()'
          },
        ],
      },
      // All other routes - strict security.
      // NOTE: regex excludes /embed and /try-embed. Trailing .+ (not .*) so pathname "/"
      // does not match here — otherwise X-Frame-Options would apply to / and block embeds.
      {
        source: '/:path((?!embed$|embed/|try-embed$|try-embed/).+)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'microphone=*, camera=(), geolocation=()'
          }
        ],
      },
    ];
  },

  // Image optimization
  images: {
    domains: [],
    formats: ['image/avif', 'image/webp'],
  },

  // Experimental features
  experimental: {
    // optimizeCss: true, // Requires critters package
  },
};

export default nextConfig;

