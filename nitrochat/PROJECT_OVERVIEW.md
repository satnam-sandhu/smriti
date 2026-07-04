# NitroChat Project Overview

## 📋 Project Summary

**NitroChat** is a production-ready, standalone AI chatbot application designed for customer-facing deployments. It connects to any MCP (Model Context Protocol) server via HTTP and provides a beautiful, responsive chat interface with full customization capabilities.

**Status:** ✅ Ready for Production
**Build Status:** ✅ Successful
**Bundle Size:** ~103 KB First Load JS

## 🎯 Key Features

### Core Functionality
- ✅ **HTTP MCP Client** - Connects to any MCP server via HTTP
- ✅ **Multi-AI Provider** - Support for OpenAI and Google Gemini
- ✅ **Tool Calling** - Full MCP tool execution support
- ✅ **Prompt Execution** - Execute MCP prompts directly
- ✅ **Resource Access** - Read MCP resources
- ✅ **Markdown Rendering** - Beautiful code syntax highlighting
- ✅ **Real-time Chat** - Smooth, responsive conversation flow

### Customization
- ✅ **Fully Configurable Branding** - Name, tagline, logo
- ✅ **Theme Customization** - 11 customizable colors
- ✅ **Feature Toggles** - Enable/disable specific features
- ✅ **Chat Behavior** - Welcome message, placeholders, suggestions
- ✅ **Custom CSS** - Add your own styles

### Security & Performance
- ✅ **Security Headers** - CSP, HSTS, X-Frame-Options, etc.
- ✅ **Rate Limiting** - Configurable per-minute limits
- ✅ **Input Sanitization** - XSS prevention
- ✅ **CORS Control** - Allowed origins configuration
- ✅ **Optimized Build** - Code splitting, compression
- ✅ **Mobile-First** - Responsive across all devices

### User Experience
- ✅ **Welcome Screen** - Beautiful onboarding experience
- ✅ **Suggested Prompts** - Quick action buttons
- ✅ **Tool Call Display** - Transparent AI operations
- ✅ **Copy Functionality** - Easy content copying
- ✅ **Chat Export** - Save conversations as JSON
- ✅ **Dark Theme** - Modern, eye-friendly design

## 📁 Project Structure

```
nitrochat/
├── app/
│   ├── layout.tsx          # Root layout with theme injection
│   ├── page.tsx            # Main chat interface
│   ├── globals.css         # Global styles & utilities
│   └── api/
│       └── chat/
│           └── route.ts    # Chat API endpoint
├── components/
│   ├── ChatInput.tsx       # Message input with auto-resize
│   ├── ChatMessage.tsx     # Message bubble component
│   ├── MarkdownRenderer.tsx # Markdown & code highlighting
│   ├── SettingsPanel.tsx   # API key configuration
│   └── WelcomeScreen.tsx   # Onboarding screen
├── lib/
│   ├── store.ts            # Zustand state management
│   ├── mcp-http-client.ts  # MCP HTTP client
│   └── utils.ts            # Utility functions
├── public/
│   └── favicon.ico         # Favicon
├── nitrochat.config.ts     # Main configuration file
├── next.config.mjs         # Next.js configuration
├── tailwind.config.ts      # Tailwind CSS configuration
├── tsconfig.json           # TypeScript configuration
├── package.json            # Dependencies
├── .env.example            # Environment variables template
├── README.md               # User documentation
├── DEPLOYMENT.md           # Deployment guide
└── PROJECT_OVERVIEW.md     # This file
```

## 🔧 Configuration System

### nitrochat.config.ts

This is the heart of customization. It includes:

1. **Branding**
   - name, tagline, logo, favicon

2. **Theme Colors** (11 customizable)
   - primary, secondary, accent, background, foreground, muted, border, card, error, success, warning

3. **MCP Settings**
   - serverUrl, apiKey, timeout

4. **Chat Behavior**
   - welcomeMessage, placeholder, maxMessageLength, suggestedPrompts

5. **AI Provider Settings**
   - defaultProvider, enableProviderSwitch, per-provider settings

6. **Feature Toggles**
   - showPrompts, showResources, showTools, enableMarkdown, enableChatHistory, etc.

7. **UI Preferences**
   - layout, maxWidth, borderRadius, fontSize, animationsEnabled

8. **Security**
   - enableRateLimit, maxRequestsPerMinute, sanitizeInput, allowedOrigins

9. **Custom CSS**
   - Add custom styles directly in config

### Environment Variables

```env
NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:3000
NEXT_PUBLIC_MCP_API_KEY=your_api_key
NEXT_PUBLIC_OPENAI_API_KEY=sk-...
NEXT_PUBLIC_GEMINI_API_KEY=AI...
```

## 🛠️ Technical Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript 5.x
- **Styling:** Tailwind CSS 3.x
- **State:** Zustand with persistence
- **AI SDKs:** OpenAI SDK, Google Generative AI SDK
- **Icons:** Lucide React
- **Fonts:** Inter (UI), JetBrains Mono (code)

## 🔒 Security Features

1. **HTTP Security Headers**
   - Strict-Transport-Security
   - X-Frame-Options
   - X-Content-Type-Options
   - X-XSS-Protection
   - Referrer-Policy
   - Permissions-Policy

2. **Rate Limiting**
   - In-memory rate limiting
   - Configurable per-minute limits

3. **Input Sanitization**
   - XSS prevention
   - HTML entity encoding

4. **API Key Storage**
   - Local browser storage only
   - Never sent to backend

5. **CORS Control**
   - Configurable allowed origins
   - Same-origin policy by default

## 📱 Responsive Design

### Breakpoints
- **Mobile:** < 640px (sm)
- **Tablet:** 640px - 1024px (md, lg)
- **Desktop:** > 1024px (xl)

### Mobile Optimizations
- Touch-optimized buttons (44px min)
- Auto-collapsing elements
- Safe area insets for notched devices
- Optimized font sizes
- Mobile-first CSS

## 🚀 Performance

### Build Optimization
- **Code Splitting:** Automatic route-based splitting
- **Compression:** Gzip/Brotli enabled
- **Tree Shaking:** Unused code removed
- **Minification:** JS/CSS minified
- **Image Optimization:** AVIF/WebP formats

### Runtime Performance
- **Lazy Loading:** Components loaded on demand
- **Debounced Inputs:** Prevents excessive API calls
- **Memoization:** React components optimized
- **Virtual Scrolling:** For long chat histories (future)

## 📊 Bundle Analysis

- **Main Page:** 16 KB
- **First Load JS:** 103 KB
- **Shared Chunks:** 87.3 KB
- **Route Chunks:** Dynamic

## 🎨 Design System

### Colors
- Primary (Blue): #3b82f6
- Secondary (Purple): #8b5cf6
- Accent (Amber): #f59e0b
- Background (Dark Slate): #0f172a
- Foreground (Light Slate): #f8fafc

### Typography
- **Body:** Inter (400, 500, 600, 700)
- **Code:** JetBrains Mono (400)
- **Sizes:** sm (14px), base (16px), lg (18px)

### Components
- Buttons, Inputs, Cards, Badges
- Consistent spacing (4px grid)
- Smooth transitions (200ms)
- Focus states for accessibility

## 🧪 Testing Checklist

Before deploying:

- [ ] Test chat with OpenAI
- [ ] Test chat with Gemini
- [ ] Test MCP tool calling
- [ ] Test prompt execution
- [ ] Test resource reading
- [ ] Test on mobile devices
- [ ] Test rate limiting
- [ ] Test error handling
- [ ] Test markdown rendering
- [ ] Test chat export
- [ ] Verify security headers
- [ ] Check bundle size
- [ ] Test CORS configuration

## 🔄 Development Workflow

### Development
```bash
npm run dev  # Runs on http://localhost:3002
```

### Production Build
```bash
npm run build
npm start
```

### Linting
```bash
npm run lint
```

## 🌐 Deployment Options

1. **Vercel** (Recommended)
   - Zero-config deployment
   - Automatic HTTPS
   - Global CDN
   - Easy environment variables

2. **Docker**
   - Full control
   - Any cloud provider
   - Kubernetes-ready

3. **Traditional Hosting**
   - AWS, GCP, Azure
   - Self-hosted
   - Custom infrastructure

## 📈 Future Enhancements

Potential features to add:

- [ ] Voice input support
- [ ] Image upload support
- [ ] Multi-language support
- [ ] Chat history persistence (database)
- [ ] User authentication
- [ ] Team collaboration
- [ ] Analytics dashboard
- [ ] A/B testing
- [ ] Custom themes gallery
- [ ] Widget marketplace

## 🤝 Integration with NitroStack

NitroChat is designed to work seamlessly with:

- **NitroStack Core:** MCP server framework
- **NitroStudio:** Development & testing environment
- **NitroCloud:** Hosting platform (planned)

## 📚 Documentation

- **README.md:** User-facing documentation
- **DEPLOYMENT.md:** Deployment guide
- **PROJECT_OVERVIEW.md:** This file

## 💬 Support

- **GitHub Issues:** Bug reports & feature requests
- **Documentation:** https://nitrostack.vercel.app/docs
- **Community:** Discord (coming soon)

---

**Built with ❤️ as part of the NitroStack ecosystem**

Version: 1.0.0
Last Updated: October 2025


