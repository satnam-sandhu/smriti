'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Image as ImageIcon, X, Plus, File, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getConfig } from '@/nitrochat.config';
import { useChatStore } from '@/lib/store';

interface ChatInputEmbedProps {
  onSend: (message: string, imageData?: { base64: string; mimeType: string }) => void;
  disabled?: boolean;
  currentTheme?: 'dark' | 'light';
  onOpenVoiceOverlay?: () => void;
  transcribedText?: string; // New: transcribed text from voice popup
  onTranscribedTextClear?: () => void; // New: callback to clear transcribed text
  /** Runtime file share — from `/api/config` `chat.enableImageUpload`; not build-time env. */
  fileShareEnabled?: boolean;
}

export function ChatInputEmbed({ onSend, disabled, currentTheme, onOpenVoiceOverlay, transcribedText, onTranscribedTextClear, fileShareEnabled: fileShareEnabledProp }: ChatInputEmbedProps) {
  const config = getConfig(); // Read config inside component
  const [value, setValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ file: File; preview: string } | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<File | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get ElevenLabs API key from store to conditionally show Voice Mode button
  const elevenLabsApiKey = useChatStore((state) => state.elevenLabsApiKey);

  const fileShareEnabled =
    fileShareEnabledProp !== undefined ? fileShareEnabledProp : config.chat.enableImageUpload;

  // Helper functions for cleanup (defined before handleSubmit so they can be used in it)
  const removeImage = useCallback(() => {
    if (selectedImage) {
      URL.revokeObjectURL(selectedImage.preview);
      setSelectedImage(null);
    }
  }, [selectedImage]);

  const removeDocument = useCallback(() => {
    setSelectedDocument(null);
  }, []);

  // Define handleSubmit first so it can be used in useEffect
  const handleSubmit = useCallback(async (textToSubmit?: string) => {
    const messageText = textToSubmit !== undefined ? textToSubmit : value.trim();
    if ((!messageText && !selectedImage && !selectedDocument) || disabled) return;

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

    const finalMessageText = messageText || 
      (selectedImage ? 'What is in this image?' : 
       selectedDocument ? `Please analyze this document: ${selectedDocument.name}` : '');

    onSend(finalMessageText, imageData);
    setValue('');
    removeImage();
    removeDocument();

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, selectedImage, selectedDocument, disabled, onSend, removeImage, removeDocument]);

  // Handle transcribed text from voice popup
  useEffect(() => {
    if (transcribedText) {
      const isAutoSubmit = transcribedText.endsWith('|AUTO_SUBMIT');
      const cleanText = isAutoSubmit ? transcribedText.replace('|AUTO_SUBMIT', '').trim() : transcribedText;

      // Replace current value with transcribed text (user can edit before sending)
      setValue(cleanText);

      // Clear the transcribed text after using it
      if (onTranscribedTextClear) {
        onTranscribedTextClear();
      }

      // Focus the textarea and move cursor to end
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
      }, 100);

      // If auto-submit flag is present, submit the message
      if (isAutoSubmit) {
        // Use a small delay to ensure the value is set before submitting
        setTimeout(() => {
          handleSubmit(cleanText); // Pass the clean text directly
        }, 150);
      }
    }
  }, [transcribedText, onTranscribedTextClear, handleSubmit]);

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


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-full">
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
          "relative flex w-full min-h-[44px] items-end rounded-2xl p-1.5 sm:rounded-3xl",
          "border border-inputBorder bg-inputBg backdrop-blur-xl",
          "shadow-sm shadow-black/10",
          "transition-colors duration-150",
          "focus-within:shadow-md focus-within:shadow-primary/5",
        )}
      >
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
                "disabled:opacity-50",
                "mr-1"
              )}
              disabled={disabled}
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

        {/* Enhanced Textarea with smaller placeholder for embed */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={config.chat.placeholder}
          disabled={disabled}
          maxLength={config.chat.maxMessageLength}
          className={cn(
            "flex-1 min-h-[40px] max-h-[200px] resize-none rounded-md border-none bg-transparent py-2 pr-3 outline-none",
            "text-[15px] leading-5 text-inputText md:text-base",
            "placeholder:text-sm placeholder:text-inputPlaceholder disabled:opacity-50",
            "scrollbar-hide",
            "pl-2"
          )}
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
          rows={1}
        />

        {/* Right side buttons */}
        <div className="flex items-center gap-1">
          {/* Voice Chat Button - Only show when API key is available */}
          {elevenLabsApiKey && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Try callback first, then dispatch event for try-embed
                if (onOpenVoiceOverlay) {
                  onOpenVoiceOverlay();
                } else {
                  window.dispatchEvent(new CustomEvent('open-voice-overlay'));
                }
              }}
              className={cn(
                "flex-shrink-0 w-10 h-10 rounded-full",
                "bg-background/50 hover:bg-background/70 text-foreground/70",
                "flex items-center justify-center",
                "transition-colors duration-150",
                "disabled:opacity-50"
              )}
              disabled={disabled}
              title="Start Voice Chat"
            >
              <Mic className="w-5 h-5" />
            </button>
          )}

          {/* Enhanced Send Button - Only show when text is typed or image/document is selected */}
          {(value.trim() || selectedImage || selectedDocument) && (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={disabled || (!value.trim() && !selectedImage && !selectedDocument)}
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
          )}
        </div>
      </div>

      {/* Client request: hide AI disclaimer (uncomment to restore)
      <div className="mt-3 text-center">
        <p className="text-xs text-muted/50">
          {config.branding.name} can make mistakes. Check important info.
        </p>
      </div>
      */}
    </div>
  );
}
