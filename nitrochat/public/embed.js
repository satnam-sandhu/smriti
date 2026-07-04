(function () {
  'use strict';

  // Get the script element to extract the host URL
  const scriptTag = document.currentScript || document.querySelector('script[src*="embed.js"]');
  const scriptSrc = scriptTag ? scriptTag.src : '';
  const hostUrl = scriptSrc ? new URL(scriptSrc).origin : window.location.origin;

  // State
  let isOpen = false;
  let iframe = null;
  let container = null;
  let button = null;
  let config = null;

  // Fetch server-side configuration
  function firstNonEmptyString() {
    for (var i = 0; i < arguments.length; i++) {
      var c = arguments[i];
      if (typeof c === 'string' && c.trim().length > 0) return c.trim();
    }
    return null;
  }

  /** Match lib/theme-runtime: effective surface (light-only nested config never returns dark). */
  function resolveEmbedThemeSurface(t2) {
    if (!t2) return 'dark';
    var mode = t2.mode || 'dark';
    var candidate;
    if (mode === 'light') candidate = 'light';
    else if (mode === 'dark') candidate = 'dark';
    else if (typeof window.matchMedia === 'function') {
      candidate = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else candidate = 'dark';
    if (candidate === 'dark' && t2.dark == null && t2.light != null) return 'light';
    return candidate;
  }

  /** Nested light/dark palettes + legacy root brand_color fallback (same order as getResolvedThemeV2Palette). */
  function resolveEmbedBrandColor(t2) {
    if (!t2) return null;
    var surface = resolveEmbedThemeSurface(t2);
    var branch = surface === 'dark' ? t2.dark : t2.light;
    var otherBranch = surface === 'dark' ? t2.light : t2.dark;
    return firstNonEmptyString(
      branch && branch.brand_color,
      otherBranch && otherBranch.brand_color,
      t2.brand_color
    );
  }

  async function fetchConfig() {
    try {
      const response = await fetch(`${hostUrl}/api/config`);
      if (!response.ok) throw new Error('Failed to fetch config');
      return await response.json();
    } catch (error) {
      console.error('NitroChat: Failed to load configuration', error);
      return null;
    }
  }

  // Create styles
  function createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .nitrochat-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .nitrochat-button {
        width: 60px;
        height: 60px;
        border-radius: 30px;
        background: var(--nitrochat-primary, #ffe500);
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
      }

      .nitrochat-button:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
      }

      .nitrochat-button svg {
        width: 28px;
        height: 28px;
        fill: #000;
      }

      .nitrochat-widget {
        position: absolute;
        bottom: 80px;
        right: 0;
        width: 400px;
        height: 600px;
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 100px);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        overflow: hidden;
        opacity: 0;
        transform: scale(0.9) translateY(20px);
        transition: opacity 0.3s, transform 0.3s;
        pointer-events: none;
        background: #000;
      }

      .nitrochat-widget.open {
        opacity: 1;
        transform: scale(1) translateY(0);
        pointer-events: auto;
      }

      .nitrochat-widget iframe {
        width: 100%;
        height: 100%;
        border: none;
      }

      @media (max-width: 768px) {
        .nitrochat-widget {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          border-radius: 0 !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Create chat button
  function createButton() {
    button = document.createElement('button');
    button.className = 'nitrochat-button';
    button.setAttribute('aria-label', 'Open chat');
    button.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
      </svg>
    `;
    button.onclick = toggleChat;
    return button;
  }

  // Create widget container
  function createWidget() {
    const widget = document.createElement('div');
    widget.className = 'nitrochat-widget';

    iframe = document.createElement('iframe');
    iframe.src = `${hostUrl}/embed`;
    iframe.allow = 'microphone; camera';
    iframe.setAttribute('title', 'NitroChat Widget');

    widget.appendChild(iframe);
    return widget;
  }

  // Toggle chat open/close
  function toggleChat() {
    isOpen = !isOpen;
    const widget = container.querySelector('.nitrochat-widget');

    if (isOpen) {
      widget.classList.add('open');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'nitrochat:opened' }, hostUrl);
      }
    } else {
      widget.classList.remove('open');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'nitrochat:closed' }, hostUrl);
      }
    }
  }

  // Handle messages from iframe
  function handleMessage(event) {
    // Verify origin
    if (event.origin !== hostUrl) return;

    const { type, data } = event.data;

    switch (type) {
      case 'nitrochat:ready':
        break;
      case 'nitrochat:close':
        if (isOpen) toggleChat();
        break;
      case 'nitrochat:resize':
        if (data && data.height) {
          const widget = container.querySelector('.nitrochat-widget');
          widget.style.height = `${Math.min(data.height, window.innerHeight - 100)}px`;
        }
        break;
    }
  }

  // Initialize widget
  async function init() {
    // Fetch configuration from server
    config = await fetchConfig();
    if (!config) {
      console.error('NitroChat: Failed to initialize - could not load configuration');
      return;
    }

    // Apply brand color from theme_version_2 (nested light/dark + legacy root)
    var brandColor =
      config.theme_version_2 && resolveEmbedBrandColor(config.theme_version_2);
    if (brandColor) {
      document.documentElement.style.setProperty('--nitrochat-primary', brandColor);
    }

    // Create styles
    createStyles();

    // Create container
    container = document.createElement('div');
    container.className = 'nitrochat-container';

    // Add button and widget
    container.appendChild(createButton());
    container.appendChild(createWidget());

    // Add to page
    document.body.appendChild(container);

    // Listen for messages
    window.addEventListener('message', handleMessage);

    // Expose minimal API
    window.NitroChat = {
      open: function () {
        if (!isOpen) toggleChat();
      },
      close: function () {
        if (isOpen) toggleChat();
      },
      toggle: toggleChat
    };

  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
