# Changelog

All notable changes to NitroChat will be documented in this file.

## [1.0.1] - 2025-10-30

### Changed
- **BREAKING:** API keys are now loaded from environment variables only
- Users no longer provide their own OpenAI/Gemini API keys
- API keys are managed server-side for better security
- Providers are automatically enabled/disabled based on configured keys

### Added
- Automatic provider detection based on environment variables
- Better error messaging when providers are not configured
- Settings panel now shows which providers are available
- Improved security with server-side key management

### Removed
- User API key input fields from settings panel
- Client-side API key storage in localStorage
- `apiKeyRequired` configuration option

### Security
- API keys no longer exposed to client-side code
- Keys are only accessed server-side in API routes
- Eliminates risk of key exposure in browser storage

### Migration Guide

If upgrading from 1.0.0:

1. **Set environment variables:**
   ```bash
   NEXT_PUBLIC_OPENAI_API_KEY=sk-...
   NEXT_PUBLIC_GEMINI_API_KEY=AI...
   ```

2. **Update configuration** (automatic):
   - The config now auto-detects available providers
   - No changes needed to `nitrochat.config.ts`

3. **Clear local storage** (optional):
   - Old API keys stored locally will be ignored
   - Users can clear browser storage if desired

## [1.0.0] - 2025-10-30

### Added
- Initial release
- Full MCP integration via HTTP
- Multi-AI provider support (OpenAI, Gemini)
- Customizable branding and theming
- Mobile-first responsive design
- Production-ready security features
- Markdown rendering with syntax highlighting
- Chat export/import functionality
- Settings panel
- Welcome screen
- Rate limiting
- Input sanitization


