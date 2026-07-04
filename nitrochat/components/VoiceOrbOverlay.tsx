'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, X, Settings, MessageCircle, Volume2, VolumeX } from 'lucide-react';
import { useChatStore } from '@/lib/store';
import { cn } from '@/lib/utils';

// LLM State type
type LLMState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VoiceOrbOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => void;
  elevenLabsApiKey: string;
  llmState: LLMState;
  spokenText?: string;
  onGreet?: () => void;
  onSettingsClick?: () => void;
  displayMode?: 'voice-only' | 'voice-chat';
  onDisplayModeChange?: (mode: 'voice-only' | 'voice-chat') => void;
  inputLanguage?: string;
  onInterrupt?: () => void;
  voiceModeActive?: boolean; // Keep speech recognition active even when overlay closed
  embedded?: boolean; // If true, render as embedded in chat instead of full-screen overlay
  onLlmStateChange?: (state: LLMState) => void; // Callback to update llmState in parent
  currentTheme?: 'dark' | 'light'; // Theme for background color
}

// Web Speech API types
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export function VoiceOrbOverlay({
  isOpen,
  onClose,
  onSendMessage,
  elevenLabsApiKey,
  llmState,
  spokenText,
  onGreet,
  onSettingsClick,
  displayMode = 'voice-only',
  onDisplayModeChange,
  inputLanguage = 'en-US',
  onInterrupt,
  voiceModeActive = false,
  onLlmStateChange,
  currentTheme = 'dark'
}: VoiceOrbOverlayProps) {
  const { ttsMuted, setTtsMuted } = useChatStore();
  const [transcript, setTranscript] = useState('');
  const [hasGreeted, setHasGreeted] = useState(false);
  const [recognitionDisabled, setRecognitionDisabled] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isListeningRef = useRef(false);
  const errorCountRef = useRef(0);
  const isRecognitionDisabledRef = useRef(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep ref in sync
  useEffect(() => {
    const wasListening = isListeningRef.current;
    isListeningRef.current = llmState === 'listening';
    if (!wasListening && llmState === 'listening') {
    }
  }, [llmState]);

  // Handle sending message
  const handleSend = useCallback((text: string) => {
    if (!text.trim()) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) { }
    }
    setTranscript('');
    onSendMessage(text.trim());
  }, [onSendMessage]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Web Speech API types
    interface WebWindow extends Window {
      SpeechRecognition?: new () => SpeechRecognition;
      webkitSpeechRecognition?: new () => SpeechRecognition;
    }
    const webWindow = window as WebWindow;
    const SpeechRecognitionCtor = webWindow.SpeechRecognition || webWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      console.error('Speech Recognition not supported');
      isRecognitionDisabledRef.current = true;
      setRecognitionDisabled(true);
      return;
    }

    // Reset disabled state when recognition is available and overlay is open
    // This allows retry when user grants permission
    if (isRecognitionDisabledRef.current && SpeechRecognitionCtor && isOpen) {
      isRecognitionDisabledRef.current = false;
      setRecognitionDisabled(false);
      errorCountRef.current = 0;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = inputLanguage; // Use configured input language

    let currentTranscript = '';

    recognition.onstart = () => {
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += text;
        } else {
          interimTranscript += text;
        }
      }

      // Console output for what is being listened to
      if (interimTranscript) {
      }
      if (finalTranscript) {
      }

      // Talk-to-interrupt: if user speaks during TTS, stop it immediately
      if ((finalTranscript || interimTranscript) && llmState === 'speaking' && onInterrupt) {
        onInterrupt();
      }

      currentTranscript = finalTranscript || interimTranscript;
      setTranscript(currentTranscript);

      if (finalTranscript.trim()) {
        
        // CRITICAL: Ignore transcripts if we're speaking or thinking
        // This prevents TTS audio from being captured as input
        if (llmState === 'speaking' || llmState === 'thinking') {
          return;
        }
        
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }

        silenceTimeoutRef.current = setTimeout(() => {
          // Double-check state hasn't changed to speaking/thinking
          if (currentTranscript.trim() && llmState === 'listening') {
            handleSend(currentTranscript.trim());
            currentTranscript = '';
          } else {
          }
        }, 800);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      
      // Handle different error types
      const error = event.error;
      
      // Fatal errors that should stop recognition permanently
      const fatalErrors = ['not-allowed', 'service-not-allowed', 'bad-grammar', 'language-not-supported'];
      
      if (fatalErrors.includes(error)) {
        isRecognitionDisabledRef.current = true;
        setRecognitionDisabled(true);
        errorCountRef.current = 0;
        
        // Stop recognition
        try {
          recognition.stop();
        } catch (e) {
          // Ignore
        }
        
        // Clear any retry timeouts
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
        
        return; // Don't retry on fatal errors
      }
      
      // Increment error count for retryable errors
      errorCountRef.current += 1;
      
      // If too many errors, disable recognition temporarily
      if (errorCountRef.current >= 3) {
        isRecognitionDisabledRef.current = true;
        setRecognitionDisabled(true);
        errorCountRef.current = 0;
        
        // Stop recognition
        try {
          recognition.stop();
        } catch (e) {
          // Ignore
        }
        
        // Clear any retry timeouts
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
      }
    };

    recognition.onend = () => {
      // Don't restart if recognition is disabled
      if (isRecognitionDisabledRef.current) {
        return;
      }
      
      // Clear retry timeout if it exists
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      
      // Only retry if we're still supposed to be listening
      if (isListeningRef.current && llmState === 'listening' && errorCountRef.current < 3) {
        retryTimeoutRef.current = setTimeout(() => {
          if (isListeningRef.current && llmState === 'listening' && !isRecognitionDisabledRef.current) {
            try {
              recognition.start();
            } catch (e) {
              console.error('Failed to restart speech recognition:', e);
              errorCountRef.current += 1;
            }
          } else {
          }
        }, 500); // Increased delay to prevent rapid retries
      } else {
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      try {
        recognition.stop();
      } catch (e) { }
    };
  }, [handleSend, llmState, inputLanguage, onInterrupt]);

  // Request microphone permission explicitly
  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the stream immediately - we just needed permission
        stream.getTracks().forEach(track => track.stop());
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Microphone permission denied:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        isRecognitionDisabledRef.current = true;
        setRecognitionDisabled(true);
      }
      return false;
    }
  }, []);

  // Start listening
  const startListening = useCallback(async () => {
    // Don't start if recognition is disabled
    if (isRecognitionDisabledRef.current) {
      return;
    }
    
    // Check current state using ref to avoid closure issues
    if (isListeningRef.current && recognitionRef.current) {
      try {
        // Request microphone permission first
        const hasPermission = await requestMicrophonePermission();
        if (!hasPermission) {
          isRecognitionDisabledRef.current = true;
          setRecognitionDisabled(true);
          return;
        }

        // Reset disabled state if permission was granted
        if (isRecognitionDisabledRef.current) {
          isRecognitionDisabledRef.current = false;
          setRecognitionDisabled(false);
          errorCountRef.current = 0;
        }

        // Only start if we're still in listening state
        if (isListeningRef.current && recognitionRef.current) {
          try {
            // Check if recognition is already running
            const recognition = recognitionRef.current as any;
            if (recognition.state === 'running' || recognition.state === 'starting') {
              return;
            }
            
            recognitionRef.current.start();
            // Reset error count on successful start
            errorCountRef.current = 0;
          } catch (startError: any) {
            // If already started, that's okay
            if (startError.message && startError.message.includes('already started')) {
            } else {
              throw startError;
            }
          }
        }
      } catch (e) {
        console.error('Failed to start speech recognition:', e);
        errorCountRef.current += 1;
        
        // Disable if too many start failures
        if (errorCountRef.current >= 3) {
          isRecognitionDisabledRef.current = true;
          setRecognitionDisabled(true);
        }
      }
    }
  }, [requestMicrophonePermission]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) { }
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    // Clear transcript when stopping to prevent stale data
    setTranscript('');
  }, []);

  // Request microphone permission when overlay opens
  useEffect(() => {
    if (isOpen && !recognitionDisabled) {
      // Request permission automatically when overlay opens
      requestMicrophonePermission().then((hasPermission) => {
        if (hasPermission) {
          isRecognitionDisabledRef.current = false;
          setRecognitionDisabled(false);
          errorCountRef.current = 0;
          // Don't set to 'listening' here - let greeting play first
          // The greeting will set state to 'speaking', then transition to 'listening' when done
          // Only set to 'listening' if we're already in 'idle' and no greeting is coming
          if (llmState === 'idle' && hasGreeted) {
            // Greeting already played, safe to set to listening
            onLlmStateChange?.('listening');
          }
        } else {
          // Permission denied - user will need to click mic button
        }
      }).catch((error) => {
        console.error('Error requesting microphone permission:', error);
      });
    }
  }, [isOpen, requestMicrophonePermission, llmState, hasGreeted]);

  // Greet on open
  useEffect(() => {
    if (isOpen && !hasGreeted && onGreet) {
      setHasGreeted(true);
      onGreet();
    }
    if (!isOpen && !voiceModeActive) {
      setHasGreeted(false);
      setTranscript('');
    }
  }, [isOpen, hasGreeted, onGreet, voiceModeActive]);

  // Start listening after greeting or when state becomes listening
  // Also listen when voiceModeActive is true (voice+chat mode)
  useEffect(() => {
    // Reset error state when overlay opens (but only if Speech Recognition is supported)
    if (isOpen && isRecognitionDisabledRef.current) {
      // Check if Speech Recognition is available
      const webWindow = window as any;
      const SpeechRecognitionCtor = webWindow.SpeechRecognition || webWindow.webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        // Allow retry when overlay is reopened
        isRecognitionDisabledRef.current = false;
        setRecognitionDisabled(false);
        errorCountRef.current = 0;
      }
    }
    
    // IMPORTANT: Stop listening when speaking or thinking to prevent feedback loop
    if (llmState === 'speaking' || llmState === 'thinking') {
      stopListening();
      // Clear any pending timeouts and transcripts
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      setTranscript('');
      return;
    }
    
    const shouldListen = (isOpen || voiceModeActive) && llmState === 'listening' && !isRecognitionDisabledRef.current;
    
    if (shouldListen && recognitionRef.current) {
      // Use a delay to ensure TTS has fully stopped and audio has settled
      // This prevents picking up any residual audio feedback
      const timeoutId = setTimeout(() => {
        // Double-check state hasn't changed
        if (llmState === 'listening' && isListeningRef.current && recognitionRef.current && !isRecognitionDisabledRef.current) {
          startListening();
        } else {
        }
      }, 600); // Increased delay to ensure TTS audio has fully stopped
      
      return () => clearTimeout(timeoutId);
    } else if (!isOpen && !voiceModeActive) {
      stopListening();
    }
  }, [isOpen, voiceModeActive, llmState, startListening, stopListening]);

  // Cleanup on close - only if voice mode is completely off
  useEffect(() => {
    if (!isOpen && !voiceModeActive) {
      stopListening();
    }
  }, [isOpen, voiceModeActive, stopListening]);

  // Handle mic click - request permission if needed
  const handleMicClick = async () => {
    // If recognition is disabled, try to request permission again
    if (recognitionDisabled || isRecognitionDisabledRef.current) {
      try {
        const hasPermission = await requestMicrophonePermission();
        if (hasPermission) {
          isRecognitionDisabledRef.current = false;
          setRecognitionDisabled(false);
          errorCountRef.current = 0;
          // Start listening after permission is granted
          if (llmState === 'listening' || llmState === 'idle') {
            onLlmStateChange?.('listening');
            await startListening();
          }
        }
      } catch (error) {
        console.error('Failed to request microphone permission:', error);
      }
      return;
    }

    // If already listening and there's a transcript, send it
    if (llmState === 'listening' && transcript.trim()) {
      handleSend(transcript.trim());
    } else if (llmState === 'idle' || llmState === 'speaking') {
      // Start listening
      onLlmStateChange?.('listening');
      await startListening();
    }
  };

  // Handle close
  const handleClose = () => {
    stopListening();
    setHasGreeted(false);
    onClose();
  };

  // Handle mute toggle
  const handleMuteToggle = () => {
    setTtsMuted(!ttsMuted);
  };

  if (!isOpen) return null;

  // Status text based on state
  const getStatusText = () => {
    // Show error message if recognition is disabled AND we're trying to listen
    // Don't show error during initialization or when not in listening state
    if (recognitionDisabled && (llmState === 'listening' || (isOpen && llmState === 'idle'))) {
      // Check if Speech Recognition is supported
      const webWindow = window as any;
      const SpeechRecognitionCtor = webWindow.SpeechRecognition || webWindow.webkitSpeechRecognition;
      if (!SpeechRecognitionCtor) {
        return 'Speech recognition not supported in this browser.';
      }
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return 'Microphone access not available. Please use a modern browser.';
      }
      return 'Click the microphone button to allow microphone access.';
    }
    
    switch (llmState) {
      case 'speaking':
        return spokenText || 'Speaking...';
      case 'thinking':
        return 'Processing your request...';
      case 'listening':
        return transcript || 'Listening...';
      default:
        return 'Ready';
    }
  };

  return (
    <div 
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center backdrop-blur-xl",
        currentTheme === 'light' ? "bg-white/95" : "bg-black/95"
      )}
      style={{ 
        backgroundColor: currentTheme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.95)' 
      }}
    >
      {/* Main Container - Properly Centered */}
      <div className="flex flex-col items-center justify-center gap-10 w-full max-w-lg px-6 h-full">

        {/* Professional Orb */}
        <div className="relative flex items-center justify-center">
          {/* Ambient glow */}
          <div
            className={`absolute w-64 h-64 rounded-full transition-all duration-700 ${llmState === 'speaking'
              ? 'bg-gradient-to-br from-blue-500/30 via-violet-500/20 to-cyan-500/30 scale-110 blur-3xl animate-pulse'
              : llmState === 'thinking'
                ? 'bg-gradient-to-br from-amber-500/20 via-orange-500/15 to-yellow-500/20 scale-100 blur-3xl animate-spin-slow'
                : llmState === 'listening'
                  ? 'bg-gradient-to-br from-blue-500/25 via-cyan-500/20 to-blue-600/25 scale-105 blur-3xl animate-pulse'
                  : 'bg-gradient-to-br from-slate-500/15 via-slate-600/10 to-slate-500/15 scale-100 blur-3xl'
              }`}
          />

          {/* Orb container */}
          <div
            className={`relative w-44 h-44 rounded-full transition-transform duration-500 ${llmState === 'speaking' ? 'scale-110'
              : llmState === 'thinking' ? 'scale-95'
                : llmState === 'listening' ? 'scale-105'
                  : 'scale-100'
              }`}
          >
            {/* Rotating gradient ring */}
            <div
              className={`absolute inset-0 rounded-full ${llmState === 'thinking' ? 'animate-spin-slow' : ''
                }`}
              style={{
                background: llmState === 'thinking'
                  ? 'conic-gradient(from 0deg, #f59e0b, #f97316, #ef4444, #f59e0b)'
                  : llmState === 'speaking'
                    ? 'conic-gradient(from 0deg, #3b82f6, #8b5cf6, #06b6d4, #3b82f6)'
                    : llmState === 'listening'
                      ? 'conic-gradient(from 0deg, #3b82f6, #60a5fa, #3b82f6)'
                      : 'conic-gradient(from 0deg, #475569, #64748b, #475569)',
                padding: '3px',
                borderRadius: '50%'
              }}
            >
              {/* Inner orb */}
              <div
                className="w-full h-full rounded-full bg-[#0a0a0a] flex items-center justify-center"
                style={{
                  boxShadow: llmState === 'speaking'
                    ? '0 0 60px 10px rgba(59, 130, 246, 0.3), inset 0 0 30px rgba(139, 92, 246, 0.2)'
                    : llmState === 'thinking'
                      ? '0 0 40px 5px rgba(245, 158, 11, 0.2), inset 0 0 20px rgba(249, 115, 22, 0.1)'
                      : llmState === 'listening'
                        ? '0 0 50px 8px rgba(59, 130, 246, 0.25), inset 0 0 25px rgba(96, 165, 250, 0.15)'
                        : '0 0 30px 5px rgba(71, 85, 105, 0.15)'
                }}
              >
                {/* Center gradient */}
                <div
                  className={`w-32 h-32 rounded-full transition-all duration-500 ${llmState === 'speaking' ? 'animate-pulse-fast'
                    : llmState === 'listening' ? 'animate-pulse'
                      : ''
                    }`}
                  style={{
                    background: llmState === 'thinking'
                      ? 'radial-gradient(circle, #f59e0b 0%, #0a0a0a 70%)'
                      : llmState === 'speaking'
                        ? 'radial-gradient(circle, #8b5cf6 0%, #3b82f6 40%, #0a0a0a 70%)'
                        : llmState === 'listening'
                          ? 'radial-gradient(circle, #60a5fa 0%, #3b82f6 40%, #0a0a0a 70%)'
                          : 'radial-gradient(circle, #64748b 0%, #0a0a0a 60%)'
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Status Text */}
        <div className="text-center max-w-md min-h-[80px] flex items-center justify-center">
          <p
            className={cn(
              "text-lg font-light leading-relaxed transition-all duration-300",
              recognitionDisabled
                ? currentTheme === 'light' ? 'text-red-600' : 'text-red-300'
                : llmState === 'speaking'
                  ? currentTheme === 'light' ? 'text-gray-900' : 'text-white'
                  : llmState === 'thinking'
                    ? currentTheme === 'light' ? 'text-amber-600 animate-pulse' : 'text-amber-300 animate-pulse'
                    : llmState === 'listening' && transcript
                      ? currentTheme === 'light' ? 'text-gray-900' : 'text-white'
                      : currentTheme === 'light' ? 'text-gray-600' : 'text-gray-300'
            )}
          >
            {getStatusText()}
          </p>
        </div>

        {/* Control Bar */}
        <div className="flex items-center gap-3">
          {/* Mute Toggle */}
          <button
            onClick={handleMuteToggle}
            className={cn(
              "w-12 h-12 rounded-full border flex items-center justify-center transition-all",
              currentTheme === 'light' ? 'border-gray-300' : 'border-white/20',
              ttsMuted
                ? currentTheme === 'light' 
                  ? 'bg-red-100 text-red-600' 
                  : 'bg-red-500/20 text-red-300'
                : currentTheme === 'light'
                  ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  : 'bg-white/10 hover:bg-white/20 text-white/60'
            )}
            title={ttsMuted ? 'Unmute TTS' : 'Mute TTS'}
          >
            {ttsMuted ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </button>

          {/* Settings */}
          {onSettingsClick && (
            <button
              onClick={onSettingsClick}
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                currentTheme === 'light'
                  ? 'bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-700'
                  : 'bg-white/10 hover:bg-white/20 border-white/20 text-white/60'
              )}
              title="Voice Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}

          {/* Main mic button */}
          <button
            onClick={handleMicClick}
            disabled={llmState === 'thinking' || llmState === 'speaking'}
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300",
              recognitionDisabled
                ? currentTheme === 'light'
                  ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 cursor-pointer'
                  : 'bg-yellow-500/30 text-yellow-300 hover:bg-yellow-500/40 cursor-pointer'
                : llmState === 'listening'
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-110'
                  : llmState === 'thinking'
                    ? currentTheme === 'light'
                      ? 'bg-amber-100 text-amber-700 cursor-wait'
                      : 'bg-amber-500/20 text-amber-400 cursor-wait'
                    : llmState === 'speaking'
                      ? currentTheme === 'light'
                        ? 'bg-violet-100 text-violet-700 cursor-not-allowed'
                        : 'bg-violet-500/20 text-violet-400 cursor-not-allowed'
                      : currentTheme === 'light'
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-white/10 text-white/60 hover:bg-white/20'
            )}
            title={recognitionDisabled ? 'Click to enable microphone access' : llmState === 'listening' ? 'Click to send message' : 'Click to start listening'}
          >
            {llmState === 'speaking' ? (
              <Volume2 className="w-7 h-7 animate-pulse" />
            ) : (
              <Mic className="w-7 h-7" />
            )}
          </button>

          {/* Display mode toggle */}
          {onDisplayModeChange && (
            <button
              onClick={() => onDisplayModeChange(displayMode === 'voice-only' ? 'voice-chat' : 'voice-only')}
              className={cn(
                "w-12 h-12 rounded-full border flex items-center justify-center transition-all",
                currentTheme === 'light' ? 'border-gray-300' : 'border-white/20',
                displayMode === 'voice-chat'
                  ? currentTheme === 'light'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-blue-500/20 text-blue-300'
                  : currentTheme === 'light'
                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    : 'bg-white/10 hover:bg-white/20 text-white/60'
              )}
              title={displayMode === 'voice-only' ? 'Show Chat' : 'Voice Only'}
            >
              <MessageCircle className="w-5 h-5" />
            </button>
          )}

          {/* Close */}
          <button
            onClick={handleClose}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all group",
              currentTheme === 'light'
                ? 'bg-gray-100 hover:bg-red-100 border-gray-300 hover:border-red-300'
                : 'bg-white/10 hover:bg-red-500/20 border-white/20 hover:border-red-500/30'
            )}
            title="End Voice Mode"
          >
            <X className={cn(
              "w-5 h-5",
              currentTheme === 'light'
                ? 'text-gray-700 group-hover:text-red-600'
                : 'text-white/60 group-hover:text-red-300'
            )} />
          </button>
        </div>

        {/* State Indicator Pills */}
        <div className="flex items-center gap-2 text-xs">
          <div className={cn(
            "px-3 py-1 rounded-full border transition-all",
            llmState === 'listening'
              ? currentTheme === 'light'
                ? 'bg-blue-100 border-blue-300 text-blue-700'
                : 'bg-blue-500/20 border-blue-500/30 text-blue-300'
              : currentTheme === 'light'
                ? 'bg-gray-100 border-gray-300 text-gray-500'
                : 'bg-white/10 border-white/20 text-gray-300'
          )}>
            Listening
          </div>
          <div className={cn(
            "px-3 py-1 rounded-full border transition-all",
            llmState === 'thinking'
              ? currentTheme === 'light'
                ? 'bg-amber-100 border-amber-300 text-amber-700'
                : 'bg-amber-500/20 border-amber-500/30 text-amber-300'
              : currentTheme === 'light'
                ? 'bg-gray-100 border-gray-300 text-gray-500'
                : 'bg-white/10 border-white/20 text-gray-300'
          )}>
            Processing
          </div>
          <div className={cn(
            "px-3 py-1 rounded-full border transition-all",
            llmState === 'speaking'
              ? currentTheme === 'light'
                ? 'bg-violet-100 border-violet-300 text-violet-700'
                : 'bg-violet-500/20 border-violet-500/30 text-violet-300'
              : currentTheme === 'light'
                ? 'bg-gray-100 border-gray-300 text-gray-500'
                : 'bg-white/10 border-white/20 text-gray-300'
          )}>
            Speaking
          </div>
        </div>
      </div>

    </div>
  );
}

