'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, HelpCircle, Wrench, FolderOpen, Sparkles, List } from 'lucide-react';
import { cn } from '@/lib/utils';

interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

interface NavbarProps {
  appName: string;
  prompts: McpPrompt[];
  onPromptClick: (prompt: McpPrompt) => void;
  onQuickAction?: (action: string) => void;
  promptsLabel?: string;
  enabled?: boolean;
}

export function Navbar({ appName, prompts, onPromptClick, onQuickAction, promptsLabel = 'Available Prompts', enabled = true }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [promptsExpanded, setPromptsExpanded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debug: Log prompts when they change
  useEffect(() => {
    if (prompts.length > 0) {
    } else {
    }
  }, [prompts]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);


  if (!enabled) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-md",
          "bg-card/50 backdrop-blur-sm",
          "hover:bg-card/70",
          "transition-colors duration-150",
          "text-lg font-normal"
        )}
        aria-label={appName}
        aria-expanded={isOpen}
      >
        <span>{appName}</span>
        <ChevronDown className={cn(
          "w-4 h-4 transition-transform duration-150",
          isOpen && "rotate-180"
        )} />
      </button>

      {isOpen && (
        <div 
          className={cn(
            "absolute top-full left-0 mt-2 w-64",
            "border border-border rounded-md",
            "shadow-2xl shadow-black/20",
            "z-50",
            "overflow-hidden"
          )}
          style={{
            backgroundColor: 'var(--color-header-bg)',
            color: 'var(--color-header-text)',
            ['--color-sidebar' as any]: 'var(--color-header-bg)',
            ['--color-foreground' as any]: 'var(--color-header-text)',
            ['--color-muted' as any]: 'var(--color-header-subtext)',
            ['--color-muted-foreground' as any]: 'var(--color-header-subtext)',
          }}
        >
          {/* Menu Content */}
          <div className="py-1">
            {/* Quick Action Options */}
            {onQuickAction && (
              <>
                <button
                  onClick={() => {
                    onQuickAction('What can you help me with?');
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2.5 flex items-center gap-3",
                    "hover:bg-primary/10 hover:text-primary",
                    "transition-colors duration-150",
                    "text-sm font-normal"
                  )}
                >
                  <HelpCircle className="w-4 h-4 flex-shrink-0" />
                  <span>What can you help me with?</span>
                </button>
                <button
                  onClick={() => {
                    onQuickAction('Show me available tools');
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2.5 flex items-center gap-3",
                    "hover:bg-primary/10 hover:text-primary",
                    "transition-colors duration-150",
                    "text-sm font-normal"
                  )}
                >
                  <Wrench className="w-4 h-4 flex-shrink-0" />
                  <span>Show me available tools</span>
                </button>
                <button
                  onClick={() => {
                    onQuickAction('List all resources');
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2.5 flex items-center gap-3",
                    "hover:bg-primary/10 hover:text-primary",
                    "transition-colors duration-150",
                    "text-sm font-normal"
                  )}
                >
                  <FolderOpen className="w-4 h-4 flex-shrink-0" />
                  <span>List all resources</span>
                </button>
              </>
            )}

            {/* Available Prompts Accordion */}
            {prompts && Array.isArray(prompts) && prompts.length > 0 && (
              <>
                <div 
                  className={cn(
                    "flex items-center justify-between px-4 py-2.5",
                    "text-sm font-normal cursor-pointer",
                    "border-t border-border/50 mt-1",
                    "hover:bg-primary/10 hover:text-primary",
                    "transition-colors duration-150"
                  )}
                  onClick={() => {
                    setPromptsExpanded(!promptsExpanded);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <List className="w-4 h-4 flex-shrink-0" />
                    <span className="text-foreground opacity-70">{promptsLabel}</span>
                  </div>
                  <ChevronRight className={cn(
                    "w-4 h-4 transition-transform duration-150",
                    promptsExpanded && "rotate-90"
                  )} />
                </div>
                {promptsExpanded && (
                  <div className="max-h-80 overflow-y-auto">
                    {prompts.map((prompt) => (
                      <button
                        key={prompt.name}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPromptClick(prompt);
                          setIsOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-4 py-2.5 flex items-start gap-3",
                          "text-foreground",
                          "hover:bg-primary/10 hover:text-primary",
                          "transition-colors duration-150",
                          "text-sm"
                        )}
                      >
                        <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-normal text-foreground">{prompt.name}</div>
                          {prompt.description && (
                            <div className="text-xs text-foreground opacity-70 mt-1 line-clamp-2">
                              {prompt.description}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {prompts.length === 0 && (
              <div className="px-4 py-2.5 text-sm text-muted">
                No prompts available
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

