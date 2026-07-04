'use client';

import { Bot, MessageSquare } from 'lucide-react';
import { ChatMessage as ChatMessageType, McpTool, useChatStore } from '@/lib/store';
import { StandaloneChatbotAvatar } from '@/components/StandaloneChatbotAvatar';
import { fallbackStandaloneChatbotLogo, type ThemeSurface } from '@/lib/theme-runtime';
import { getConfig } from '@/nitrochat.config';
import { formatTime, cn } from '@/lib/utils';
import { MarkdownRenderer } from './MarkdownRenderer';
import { McpWidget } from './McpWidget';

function toolOutputTemplateUri(toolDef: McpTool | undefined): string | undefined {
  if (!toolDef) return undefined;
  const extended = toolDef as McpTool & { widget?: { route?: string }; outputTemplate?: string };
  return (
    toolDef._meta?.['openai/outputTemplate'] ||
    toolDef._meta?.['ui/template'] ||
    extended.widget?.route ||
    extended.outputTemplate
  );
}

interface ChatMessageProps {
  message: ChatMessageType;
  currentTheme?: 'dark' | 'light';
  brandName?: string;
  standaloneMode?: boolean;
  chatbotLogo?: string;
}

export function ChatMessage({ message, currentTheme, brandName, standaloneMode, chatbotLogo }: ChatMessageProps) {
  if (message.hidden) return null;

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';
  const { tools } = useChatStore();
  const config = getConfig();
  const displayName = brandName || 'Assistant';
  const standaloneFontStyle = config.branding?.fontFamily
    ? ({ fontFamily: config.branding.fontFamily } as const)
    : undefined;
  const trimmedContent = message.content.trim();
  const visibleContent = message.content.replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  const hasReadableText = /[\p{L}\p{N}]/u.test(trimmedContent);

  const themeSurface: ThemeSurface = currentTheme === 'dark' ? 'dark' : 'light';
  const standaloneAvatarSrc = standaloneMode
    ? chatbotLogo?.trim() || fallbackStandaloneChatbotLogo(themeSurface)
    : undefined;

  const renderStandaloneLoader = () => (
    <div className="flex w-full justify-start" style={standaloneFontStyle}>
      <div className="flex max-w-[min(40rem,90%)] items-start gap-3 sm:max-w-[78%] sm:gap-4">
        {standaloneAvatarSrc ? (
          <StandaloneChatbotAvatar
            src={standaloneAvatarSrc}
            surface={themeSurface}
            variant="message"
            standaloneMode={true}
          />
        ) : (
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted/25 ring-1 ring-border/40 md:h-9 md:w-9">
            <Bot className="h-4 w-4 text-foreground/60 md:h-[1.125rem] md:w-[1.125rem]" strokeWidth={2} />
          </div>
        )}
        <div
          className="flex min-w-[7.5rem] items-center justify-center gap-2 rounded-2xl border border-border/60 bg-aiBubbleBg px-5 py-4 text-aiBubbleText shadow-sm"
          role="status"
          aria-label="Assistant is typing"
        >
          <span className="inline-block h-2 w-2 animate-dot-bounce rounded-full bg-muted" style={{ animationDelay: '0ms' }} />
          <span className="inline-block h-2 w-2 animate-dot-bounce rounded-full bg-muted" style={{ animationDelay: '150ms' }} />
          <span className="inline-block h-2 w-2 animate-dot-bounce rounded-full bg-muted" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );

  if (isTool) {
    const toolDef = message.toolName ? tools.find(t => t.name === message.toolName) : undefined;
    const widgetTemplate = toolOutputTemplateUri(toolDef);

    if (widgetTemplate) {
      return (
        <div className="w-full py-4 md:py-5">
          <div className="w-full">
            <McpWidget
              toolName={message.toolName || 'Unknown Tool'}
              toolResult={message.result ?? (() => {
                try {
                  return JSON.parse(message.content);
                } catch {
                  return message.content;
                }
              })()}
              templateUri={widgetTemplate}
              currentTheme={currentTheme}
            />
          </div>
        </div>
      );
    }

    // No widget template - don't render tool output section
    return null;
  }

  // In standalone mode, render placeholder assistant turns as loader dots bubble
  // so users never see an empty message container.
  if (standaloneMode && isAssistant && !message.imageData && (visibleContent.length === 0 || !hasReadableText)) {
    return renderStandaloneLoader();
  }

  if (standaloneMode) {
    return (
      <div className={cn('w-full', isUser ? 'flex justify-end' : 'flex justify-start')} style={standaloneFontStyle}>
        <div
          className={cn(
            'flex min-w-0 items-start gap-2 sm:gap-3',
            isUser ? 'max-w-[min(32rem,92%)] flex-row-reverse' : 'w-full',
          )}
        >
          {/* Avatar */}
          {!isUser && standaloneAvatarSrc ? (
            <StandaloneChatbotAvatar
              src={standaloneAvatarSrc}
              surface={themeSurface}
              variant="message"
              standaloneMode={true}
            />
          ) : !isUser ? (
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted/25 ring-1 ring-border/40 sm:h-8 sm:w-8">
              <Bot className="h-3.5 w-3.5 text-foreground/60 sm:h-4 sm:w-4" strokeWidth={2} />
            </div>
          ) : null}

          {/* Bubble */}
          <div
            className={cn(
              'min-w-0 rounded-xl px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3 md:px-5 md:py-3.5',
              isUser
                ? 'max-w-full bg-userBubbleBg text-userBubbleText shadow-sm'
                : 'w-full flex-1 border border-border/70 bg-aiBubbleBg text-aiBubbleText shadow-sm',
            )}
          >
            {message.imageData && (
              <div className="mb-2">
                <img
                  src={`data:${message.imageData.mimeType};base64,${message.imageData.base64}`}
                  alt="Uploaded image"
                  className="max-w-[200px] md:max-w-xs max-h-48 rounded-md"
                />
              </div>
            )}

            {(() => {
              const looksLikeJSON = (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) ||
                (trimmedContent.startsWith('[') && trimmedContent.endsWith(']'));

              if (looksLikeJSON) {
                return (
                  <pre className="text-xs md:text-sm font-mono whitespace-pre-wrap">{message.content}</pre>
                );
              } else if (standaloneMode && isAssistant && !hasReadableText) {
                return renderStandaloneLoader();
              } else if (isAssistant) {
                return <MarkdownRenderer content={message.content} compact />;
              } else {
                return (
                  <p className="text-xs md:text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                );
              }
            })()}


          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-4 md:py-5">
      <div className="w-full flex gap-4 md:gap-5">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {isUser ? (
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md md:h-10 md:w-10',
                currentTheme === 'light'
                  ? 'border border-border/60 bg-white shadow-sm'
                  : 'bg-gradient-to-br from-primary/90 to-primary'
              )}
              title="Your message"
            >
              <MessageSquare
                className={cn(
                  'h-4 w-4 md:h-5 md:w-5',
                  currentTheme === 'light' ? 'text-primary' : 'text-white'
                )}
                style={{ color: 'var(--color-header-bg)' }}
                strokeWidth={2.25}
                aria-hidden
              />
            </div>
          ) : chatbotLogo ? (
            <img
              src={chatbotLogo}
              alt=""
              className="w-9 h-9 md:w-10 md:h-10 rounded-md object-cover flex-shrink-0"
            />
          ) : (
            <div className={cn(
              "w-9 h-9 md:w-10 md:h-10 rounded-md flex items-center justify-center",
              currentTheme === 'light'
                ? "bg-white"
                : "bg-gradient-to-br from-secondary/90 to-secondary/70"
            )}>
              <Bot 
                className={cn(
                  "w-4 h-4 md:w-5 md:h-5",
                  currentTheme === 'light' ? "text-black" : "text-white"
                )}
                strokeWidth={2.5}
                style={currentTheme === 'light'
                  ? { color: '#000000', stroke: '#000000' }
                  : { color: '#ffffff', stroke: '#ffffff' }
                }
              />
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Header */}
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-normal text-foreground md:text-base">
              {isUser ? 'You' : displayName}
            </span>
            <span className="text-xs text-muted/60">
              {formatTime(message.timestamp)}
            </span>
          </div>

          {/* Image attachment */}
          {message.imageData && (
            <div className="mb-3">
              <img
                src={`data:${message.imageData.mimeType};base64,${message.imageData.base64}`}
                alt="Uploaded image"
                className="max-w-md max-h-96 rounded-md border-2 border-primary/20"
              />
            </div>
          )}

          {/* Message content - no bubble, just direct content */}
          <div>
            {/* Message content */}
            {(() => {
              // Check if content looks like JSON
              const trimmedContent = message.content.trim();
              const looksLikeJSON = (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) ||
                (trimmedContent.startsWith('[') && trimmedContent.endsWith(']'));

              if (looksLikeJSON) {
                // Render JSON in a code block
                return (
                  <div className="glass-panel rounded-lg p-4 overflow-x-auto">
                    <pre className="text-sm font-mono text-foreground/90 whitespace-pre-wrap">
                      {message.content}
                    </pre>
                  </div>
                );
              } else if (isAssistant) {
                // Use markdown renderer for all assistant messages
                return <MarkdownRenderer content={message.content} />;
              } else {
                // Plain text for user messages
                return (
                  <p className="text-[15px] md:text-base leading-7 text-foreground/90 whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                );
              }
            })()}


          </div>
        </div>
      </div>
    </div>
  );
}
