'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Image as ImageIcon, X, Plus, File, Mic, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getConfig } from '@/nitrochat.config';
import { STANDALONE_CHAT_INPUT_WRAPPER_CLASS } from '@/lib/standalone-layout';
import { useChatStore } from '@/lib/store';
import { ModelSelector } from '@/components/ModelSelector';
import type { ContextUsage } from '@/lib/context-utils';

interface ChatInputProps {
  onSend: (message: string, imageData?: { base64: string; mimeType: string }) => void;
  disabled?: boolean;
  /** When set and disabled (loading), a Stop button is shown to cancel the in-flight request */
  onStop?: () => void;
  currentTheme?: 'dark' | 'light';
  onOpenVoiceSettings?: () => void;
  transcribedText?: string; // New: transcribed text from voice popup
  onTranscribedTextClear?: () => void; // New: callback to clear transcribed text
  /** Standalone page: centered composer with side gutters (matches main chat max width) */
  standaloneLayout?: boolean;
  /** Gateway model picker in the composer (when enabled). */
  modelSelectionEnabled?: boolean;
  /** When true, model UI lives in the shell navbar instead of here. */
  hideModelSelector?: boolean;
  selectedModel?: string;
  availableModels?: Array<{ id: string; name: string; provider?: string }>;
  modelsLoading?: boolean;
  onModelChange?: (model: string) => void;
  /** When set, shows estimated context vs limit under the composer (same basis as send-time checks). */
  contextUsage?: ContextUsage | null;
  /**
   * When set, overrides build-time `NEXT_PUBLIC_ENABLE_FILE_SHARE` (Knative/runtime env is not visible
   * to the client bundle — use `/api/config` + merged `config.chat.enableImageUpload` from the parent).
   */
  fileShareEnabled?: boolean;
  /** When true, composer is read-only (session ended). Unlike loading-only disabled, no spinner is shown. */
  sessionEnded?: boolean;
}

export function ChatInput({
  onSend,
  disabled,
  onStop,
  currentTheme,
  onOpenVoiceSettings,
  transcribedText,
  onTranscribedTextClear,
  standaloneLayout = false,
  modelSelectionEnabled,
  hideModelSelector = false,
  selectedModel,
  availableModels = [],
  modelsLoading,
  onModelChange,
  contextUsage,
  fileShareEnabled: fileShareEnabledProp,
  sessionEnded = false,
}: ChatInputProps) {
  const config = getConfig(); // Read config inside component
  const inputLocked = !!disabled || sessionEnded;
  const [value, setValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ file: File; preview: string } | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<File | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get ElevenLabs API key from store to conditionally show voice button
  const elevenLabsApiKey = useChatStore((state) => state.elevenLabsApiKey);

  // Handle transcribed text from voice popup
  useEffect(() => {
    if (transcribedText) {
      
      // Check if this is an auto-submit request
      const isAutoSubmit = transcribedText.endsWith('|AUTO_SUBMIT');
      const text = isAutoSubmit ? transcribedText.replace('|AUTO_SUBMIT', '') : transcribedText;
      
      // Update input value with transcribed text (real-time updates)
      setValue(text);
      
      // Clear the transcribed text after using it
      if (onTranscribedTextClear) {
        onTranscribedTextClear();
      }
      
      // Focus the textarea and move cursor to end
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(text.length, text.length);
        }
      }, 50);
      
      // Auto-submit if flag is set
      if (isAutoSubmit && text.trim() && !inputLocked) {
        // Small delay to ensure value is set, then submit
        setTimeout(() => {
          // Trigger submit by calling handleSubmit logic
          if (text.trim()) {
            onSend(text.trim());
            setValue('');
            // Reset textarea height
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
            }
          }
        }, 150); // Small delay to ensure value is set
      }
    }
  }, [transcribedText, onTranscribedTextClear, disabled, sessionEnded, onSend]);

  const fileShareEnabled =
    fileShareEnabledProp !== undefined ? fileShareEnabledProp : config.chat.enableImageUpload;

  // Handle voice chat button click
  const handleVoiceChatClick = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-voice-overlay'));
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);


  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if file is an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    // Create preview URL
    const preview = URL.createObjectURL(file);
    setSelectedImage({ file, preview });
    setDropdownOpen(false);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleDocumentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if file is a supported document type
    const supportedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-word.document.macroEnabled.12'
    ];
    
    const isValidType = supportedTypes.includes(file.type) || 
      file.name.endsWith('.pdf') || 
      file.name.endsWith('.doc') || 
      file.name.endsWith('.docx');

    if (!isValidType) {
      alert('Please select a PDF, DOC, or DOCX file');
      return;
    }

    // Check file size (max 10MB for documents)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    setSelectedDocument(file);
    setDropdownOpen(false);

    // Reset file input
    if (documentInputRef.current) {
      documentInputRef.current.value = '';
    }
  };

  const handleDocumentButtonClick = () => {
    if (documentInputRef.current) {
      documentInputRef.current.click();
    }
  };

  const removeDocument = () => {
    setSelectedDocument(null);
  };

  const removeImage = () => {
    if (selectedImage) {
      URL.revokeObjectURL(selectedImage.preview);
      setSelectedImage(null);
    }
  };

  const handleSubmit = async () => {
    if ((!value.trim() && !selectedImage && !selectedDocument) || disabled || sessionEnded) return;

    let imageData: { base64: string; mimeType: string } | undefined;

    if (selectedImage) {
      // Convert image to base64
      const reader = new FileReader();
      imageData = await new Promise((resolve, reject) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve({
            base64,
            mimeType: selectedImage.file.type
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedImage.file);
      });
    } else if (selectedDocument) {
      // Convert document to base64
      const reader = new FileReader();
      imageData = await new Promise((resolve, reject) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve({
            base64,
            mimeType: selectedDocument.type || 'application/pdf'
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedDocument);
      });
    }

    const messageText = value.trim() || 
      (selectedImage ? 'What is in this image?' : 
       selectedDocument ? `Please analyze this document: ${selectedDocument.name}` : '');

    onSend(messageText, imageData);
    setValue('');
    removeImage();
    removeDocument();

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className={cn(
        'w-full',
        standaloneLayout
          ? STANDALONE_CHAT_INPUT_WRAPPER_CLASS
          : 'mx-auto max-w-4xl px-4 pb-6 md:px-6',
      )}
    >
      {/* Image preview */}
      {selectedImage && (
        <div className="mb-3 relative inline-block">
          <img
            src={selectedImage.preview}
            alt="Upload preview"
            className="max-h-32 rounded-md border-2 border-primary/20 shadow-lg"
          />
          <button
            onClick={removeImage}
            className="absolute -top-2 -right-2 w-7 h-7 bg-error rounded-full flex items-center justify-center hover:bg-error/80 transition-colors duration-150"
            title="Remove image"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      )}

      {/* Document preview */}
      {selectedDocument && (
        <div className="mb-3 relative inline-flex items-center gap-2 px-3 py-2 bg-card/50 border border-border/50 rounded-md">
          <File className="w-5 h-5 text-foreground/70" />
          <span className="text-sm text-foreground/80 max-w-xs truncate">
            {selectedDocument.name}
          </span>
          <button
            onClick={removeDocument}
            className="ml-2 p-1 rounded hover:bg-error/20 hover:text-error transition-colors duration-150"
            title="Remove document"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div
        className={cn(
          'flex w-full gap-2 sm:gap-3',
          modelSelectionEnabled &&
            onModelChange &&
            !hideModelSelector &&
            'flex-col sm:flex-row sm:items-end',
        )}
      >
        {modelSelectionEnabled && onModelChange && !hideModelSelector && (
          <div className="w-full shrink-0 sm:w-auto sm:min-w-[200px] sm:max-w-[min(320px,38%)]">
            <ModelSelector
              selectedModel={selectedModel ?? 'openrouter/auto'}
              availableModels={availableModels}
              modelsLoading={modelsLoading}
              onModelChange={onModelChange}
              currentTheme={currentTheme}
              openUpward
              showLabel={false}
            />
          </div>
        )}

        <div
          className={cn(
            'relative flex min-w-0 flex-1 items-end gap-2 sm:gap-3',
            'bg-inputBg backdrop-blur-xl',
            'rounded-2xl border border-inputBorder sm:rounded-3xl',
            'shadow-sm shadow-black/10',
            'transition-colors duration-150',
            'focus-within:shadow-primary/5 focus-within:shadow-md',
            'p-2',
          )}
        >
        {/* Circular loading indicator when LLM is generating */}
        {disabled && !sessionEnded && (
          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10" aria-hidden>
            <Loader2 className="w-5 h-5 text-primary animate-spin" aria-label="Generating" />
          </div>
        )}
        {/* File upload button with dropdown */}
        {fileShareEnabled && (
          <div className="relative" ref={dropdownRef}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            <input
              ref={documentInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleDocumentSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={cn(
                "flex-shrink-0 w-10 h-10 rounded-full",
                "bg-background/50 hover:bg-background/70",
                "flex items-center justify-center",
                "transition-colors duration-150",
                "disabled:opacity-50"
              )}
              disabled={inputLocked}
              title="Add attachment"
            >
              <Plus className="w-5 h-5 text-foreground/70" />
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div className={cn(
                "absolute bottom-full left-0 mb-2 w-48",
                "bg-card border border-border/50 rounded-lg",
                "shadow-lg shadow-black/20",
                "py-1 z-50"
              )}>
                <button
                  type="button"
                  onClick={handleFileSelect}
                  className={cn(
                    "w-full text-left px-4 py-2.5 flex items-center gap-3",
                    "hover:bg-primary/10 hover:text-primary",
                    "transition-colors duration-150",
                    "text-sm font-normal"
                  )}
                >
                  <ImageIcon className="w-4 h-4 flex-shrink-0" />
                  <span>Add images</span>
                </button>
                <button
                  type="button"
                  onClick={handleDocumentButtonClick}
                  className={cn(
                    "w-full text-left px-4 py-2.5 flex items-center gap-3",
                    "hover:bg-primary/10 hover:text-primary",
                    "transition-colors duration-150",
                    "text-sm font-normal"
                  )}
                >
                  <File className="w-4 h-4 flex-shrink-0" />
                  <span>Add files</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Enhanced Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            sessionEnded ? 'This conversation has ended.' : config.chat.placeholder
          }
          disabled={inputLocked}
          maxLength={config.chat.maxMessageLength}
          className={cn(
            "flex-1 min-h-[44px] max-h-[200px] py-2.5 px-3",
            "border-none rounded-md outline-none resize-none bg-transparent",
            "text-[15px] md:text-base text-inputText",
            "placeholder:text-inputPlaceholder",
            "disabled:opacity-50",
            "leading-6"
          )}
          rows={1}
        />

        {/* Voice Chat Button - Only show when API key is available */}
        {elevenLabsApiKey && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                // Shift/Ctrl/Cmd + Click opens settings
                onOpenVoiceSettings?.();
              } else {
                // Regular click opens voice overlay
                handleVoiceChatClick();
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenVoiceSettings?.();
            }}
            className={cn(
              "flex-shrink-0 w-10 h-10 rounded-full",
              "bg-background/50 hover:bg-background/70",
              "flex items-center justify-center",
              "transition-colors duration-150",
              "disabled:opacity-50"
            )}
            disabled={inputLocked}
            title="Voice Chat (Right-click for settings)"
          >
            <Mic className="w-5 h-5 text-foreground/70" />
          </button>
        )}

        {/* Stop button when loading and onStop provided */}
        {disabled && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className={cn(
              "flex-shrink-0 w-10 h-10 rounded-full",
              "border-2 border-border/50",
              "text-error border-error/30",
              standaloneLayout
                ? "bg-transparent hover:bg-transparent hover:border-error/45"
                : "bg-error/10 hover:bg-error/20",
              "transition-all duration-150",
              "flex items-center justify-center"
            )}
            title="Stop generating"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        ) : (
          /* Enhanced Send Button - Only show when text is typed or image/document is selected */
          (value.trim() || selectedImage || selectedDocument) && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={inputLocked || (!value.trim() && !selectedImage)}
              className={cn(
                "flex-shrink-0 w-10 h-10 rounded-full",
                "border-2 border-inputBorder",
                "bg-inputSendBg text-inputSendIcon backdrop-blur-sm",
                "hover:opacity-90",
                "shadow-sm shadow-black/10",
                "disabled:opacity-30 disabled:cursor-not-allowed",
                "transition-all duration-150",
                "flex items-center justify-center"
              )}
            >
              <div className="w-6 h-6 rounded-full flex items-center justify-center bg-inputSendBg">
                <ArrowUp className="w-4 h-4 text-inputSendIcon" />
              </div>
            </button>
          )
        )}
        </div>
      </div>

      {/* Client request: hide context token estimate + progress (uncomment to restore)
      {contextUsage && (
        <div
          className={cn(
            'mt-2.5 w-full space-y-1.5',
            standaloneLayout ? 'px-0.5' : 'px-0.5 sm:px-1',
          )}
          aria-label="Approximate chat context versus token budget"
          title="Used column is a rough estimate (message characters ÷ 4), not word count. The limit is your configured token budget (CHAT_CONTEXT_MAX_TOKENS); models tokenize text differently."
        >
          <div className="flex items-baseline justify-between gap-2 text-[11px] leading-tight text-muted/75 sm:text-xs">
            <span className="min-w-0">
              <span className="text-muted/65">Est. tokens</span>{' '}
              <span className="tabular-nums font-medium text-foreground/85">
                ~{contextUsage.used.toLocaleString()}
              </span>
              <span className="text-muted/60"> / </span>
              <span className="tabular-nums font-medium text-foreground/85">
                {contextUsage.max.toLocaleString()}
              </span>
              <span className="text-muted/60"> token limit</span>
            </span>
            <span
              className={cn(
                'shrink-0 tabular-nums text-muted/65',
                contextUsage.percent >= 90 && 'font-medium text-warning',
                contextUsage.percent >= 70 && contextUsage.percent < 90 && 'font-medium text-amber-600 dark:text-amber-400',
              )}
            >
              {contextUsage.percent}%
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-border/45">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-300 ease-out',
                contextUsage.percent >= 90
                  ? 'bg-warning'
                  : contextUsage.percent >= 70
                    ? 'bg-amber-500 dark:bg-amber-500/90'
                    : 'bg-primary/55',
              )}
              style={{ width: `${contextUsage.percent}%` }}
            />
          </div>
        </div>
      )}
      */}

      {/* Client request: hide AI disclaimer (uncomment to restore)
      <div className={cn('text-center', standaloneLayout ? 'mt-2' : 'mt-3')}>
        <p className="text-xs text-muted/50">
          {config.branding.name} can make mistakes. Check important info.
        </p>
      </div>
      */}
    </div>
  );
}


