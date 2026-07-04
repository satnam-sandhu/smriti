'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, X } from 'lucide-react';

interface VoiceChatPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscript: (text: string) => void; // Callback to send transcript to ChatInput
  inputLanguage?: string;
  isSpeaking?: boolean; // Track when TTS is speaking
  onGreet?: () => void; // Callback to play greeting when popup opens
}

// Web Speech API types
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
}

// Type definitions for Web Speech API - using type assertions to avoid conflicts
type SpeechRecognitionConstructor = new () => SpeechRecognition;

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

export function VoiceChatPopup({
  isOpen,
  onClose,
  onTranscript,
  inputLanguage = 'en-US',
  isSpeaking = false, // Track when TTS is speaking
  onGreet, // Optional greeting callback
}: VoiceChatPopupProps) {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recognitionDisabled, setRecognitionDisabled] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isListeningRef = useRef(false);
  const errorCountRef = useRef(0);
  const isRecognitionDisabledRef = useRef(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isOpenRef = useRef(isOpen);
  const isProcessingRef = useRef(false);
  const speakingDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasSpeakingRef = useRef(false); // Track previous speaking state

  // Update isOpen ref when isOpen changes
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Greet on open (similar to VoiceOrbOverlay)
  useEffect(() => {
    if (isOpen && !hasGreeted && onGreet) {
      setHasGreeted(true);
      onGreet();
    }
    if (!isOpen) {
      setHasGreeted(false);
      setTranscript('');
    }
  }, [isOpen, hasGreeted, onGreet]);

  // Handle sending transcript to input
  const handleSend = useCallback((text: string) => {
    if (!text.trim()) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) { }
    }
    setTranscript('');
    // Send to input instead of auto-sending
    onTranscript(text.trim());
  }, [onTranscript]);

  // Initialize Speech Recognition - EXACT implementation from VoiceOrbOverlay
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Use type assertions to avoid type conflicts with browser's built-in types
    const webWindow = window as any;
    const SpeechRecognitionCtor = webWindow.SpeechRecognition || webWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      console.error('Speech Recognition not supported');
      isRecognitionDisabledRef.current = true;
      setRecognitionDisabled(true);
      return;
    }

    // Reset disabled state when recognition is available and popup is open
    // This allows retry when user grants permission
    if (isRecognitionDisabledRef.current && SpeechRecognitionCtor && isOpen) {
      isRecognitionDisabledRef.current = false;
      setRecognitionDisabled(false);
      errorCountRef.current = 0;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false; // EXACT: Match VoiceOrbOverlay
    recognition.interimResults = true;
    recognition.lang = inputLanguage; // Use configured input language

    let currentTranscript = '';

    recognition.onstart = () => {
      setIsListening(true);
      isListeningRef.current = true;
      setError(null);
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

      // CRITICAL: Ignore transcripts if we're processing, popup is closed, or TTS is speaking
      // This prevents capturing audio when processing messages or TTS is active
      if (isProcessingRef.current || !isOpenRef.current || isSpeaking) {
        return;
      }

      currentTranscript = finalTranscript || interimTranscript;
      setTranscript(currentTranscript);

      // Send to input in real-time for live updates
      if (currentTranscript.trim() && !isProcessingRef.current) {
        onTranscript(currentTranscript.trim());
      }

      if (finalTranscript.trim()) {
        
        // CRITICAL: Ignore transcripts if we're processing or TTS is speaking
        // This prevents TTS audio from being captured as input
        if (isProcessingRef.current || isSpeaking) {
          return;
        }
        
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }

        silenceTimeoutRef.current = setTimeout(() => {
          // Double-check popup is still open, not processing, and not speaking
          if (currentTranscript.trim() && isListeningRef.current && isOpenRef.current && !isProcessingRef.current && !isSpeaking) {
            // Mark as processing
            isProcessingRef.current = true;
            handleSend(currentTranscript.trim() + '|AUTO_SUBMIT');
            currentTranscript = '';
            // Reset processing after delay
            setTimeout(() => {
              isProcessingRef.current = false;
            }, 2000);
          } else {
          }
        }, 800); // EXACT: Match VoiceOrbOverlay timeout
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
        
        setIsListening(false);
        isListeningRef.current = false;
        setError(`Recognition error: ${error}`);
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
        
        setIsListening(false);
        isListeningRef.current = false;
        setError('Too many recognition errors. Please try again.');
      }
    };

    recognition.onend = () => {
      // Don't restart if recognition is disabled
      if (isRecognitionDisabledRef.current) {
        setIsListening(false);
        isListeningRef.current = false;
        return;
      }
      
      // Don't restart if popup is closed, processing, speaking, or in debounce period
      if (!isOpenRef.current || isProcessingRef.current || isSpeaking || speakingDebounceTimeoutRef.current) {
        setIsListening(false);
        isListeningRef.current = false;
        return;
      }
      
      // Clear retry timeout if it exists
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      
      setIsListening(false);
      isListeningRef.current = false;
      
      // Only retry if we're still supposed to be listening and not speaking/in debounce
      if (isOpenRef.current && !isProcessingRef.current && !isSpeaking && !speakingDebounceTimeoutRef.current && errorCountRef.current < 3) {
        retryTimeoutRef.current = setTimeout(() => {
          if (isOpenRef.current && !isListeningRef.current && !isRecognitionDisabledRef.current && !isProcessingRef.current && !isSpeaking && !speakingDebounceTimeoutRef.current) {
            try {
              recognition.start();
            } catch (e) {
              console.error('Failed to restart speech recognition:', e);
              errorCountRef.current += 1;
            }
          } else {
          }
        }, 500);
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
      if (speakingDebounceTimeoutRef.current) {
        clearTimeout(speakingDebounceTimeoutRef.current);
      }
      try {
        recognition.stop();
      } catch (e) { }
    };
  }, [handleSend, inputLanguage, isOpen, onTranscript, isSpeaking]);

  // Track speaking state changes for debounce
  useEffect(() => {
    const wasSpeaking = wasSpeakingRef.current;
    wasSpeakingRef.current = isSpeaking;

    // If speaking just started, stop listening immediately
    if (isSpeaking && !wasSpeaking) {
      if (recognitionRef.current && isListeningRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore
        }
      }
      setIsListening(false);
      isListeningRef.current = false;
      
      // Clear any pending timeouts and transcripts
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      if (speakingDebounceTimeoutRef.current) {
        clearTimeout(speakingDebounceTimeoutRef.current);
        speakingDebounceTimeoutRef.current = null;
      }
      setTranscript('');
    }

    // If speaking just ended, wait 2 seconds before resuming (debounce)
    if (!isSpeaking && wasSpeaking) {
      // Clear any existing debounce timeout
      if (speakingDebounceTimeoutRef.current) {
        clearTimeout(speakingDebounceTimeoutRef.current);
      }
      // Wait 2 seconds before resuming
      speakingDebounceTimeoutRef.current = setTimeout(() => {
        speakingDebounceTimeoutRef.current = null;
        // Will be handled by the main useEffect below
      }, 2000); // 2 second debounce
    }
  }, [isSpeaking]);

  // Start/stop recognition based on popup state - EXACT pattern from VoiceOrbOverlay
  useEffect(() => {
    if (!recognitionRef.current) return;

    // IMPORTANT: Stop listening when processing or speaking
    if (isProcessingRef.current || isSpeaking) {
      try {
        if (recognitionRef.current && isListeningRef.current) {
          recognitionRef.current.stop();
        }
      } catch (e) {
        // Ignore
      }
      setIsListening(false);
      isListeningRef.current = false;
      
      // Clear any pending timeouts and transcripts
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      setTranscript('');
      return;
    }

    // Don't start if we're in debounce period (speaking just ended)
    if (speakingDebounceTimeoutRef.current) {
      return;
    }

    const shouldListen = isOpen && !isRecognitionDisabledRef.current;
    
    if (shouldListen && recognitionRef.current && !isListeningRef.current) {
      // Request microphone permission first, then start recognition
      const startRecognition = async () => {
        try {
          // Request microphone permission
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            await navigator.mediaDevices.getUserMedia({ audio: true });
          }
          // Now start recognition after permission is granted
          if (isOpen && !isListeningRef.current && recognitionRef.current && !isRecognitionDisabledRef.current && !isProcessingRef.current && !isSpeaking && !speakingDebounceTimeoutRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              console.error('Failed to start recognition:', e);
              errorCountRef.current += 1;
            }
          }
        } catch (error: any) {
          console.error('Microphone permission denied:', error);
          isRecognitionDisabledRef.current = true;
          setRecognitionDisabled(true);
          setError('Microphone permission required');
        }
      };
      
      // Use a delay to ensure state is settled
      const timeoutId = setTimeout(() => {
        startRecognition();
      }, 100);
      
      return () => clearTimeout(timeoutId);
    } else if (!isOpen) {
      // Stop when popup closes
      try {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      } catch (e) {
        // Ignore
      }
      setIsListening(false);
      isListeningRef.current = false;
      setTranscript('');
      // Clear debounce timeout
      if (speakingDebounceTimeoutRef.current) {
        clearTimeout(speakingDebounceTimeoutRef.current);
        speakingDebounceTimeoutRef.current = null;
      }
    }
  }, [isOpen, isProcessingRef.current, isSpeaking, recognitionDisabled]);

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

  if (!isOpen) return null;

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-28 right-5 z-[10000] pointer-events-auto">
      <div className="bg-card border border-border rounded-lg shadow-lg p-4 min-w-[300px] max-w-[400px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-sm font-medium text-foreground">
              {isListening ? 'Listening...' : 'Voice Input'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Minimal status display - text goes directly to input */}
        <div className="mb-3 min-h-[40px] flex items-center justify-center">
          {isListening ? (
            <p className="text-xs text-muted-foreground italic">
              Speaking... (text appears in input below)
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Ready to listen
            </p>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-3 p-2 bg-error/10 border border-error/30 rounded text-xs text-error">
            {error}
          </div>
        )}

        {/* Mic Icon */}
        <div className="flex justify-center">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isListening
                ? 'bg-primary animate-pulse'
                : 'bg-muted'
            }`}
          >
            <Mic className={`w-6 h-6 ${isListening ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
