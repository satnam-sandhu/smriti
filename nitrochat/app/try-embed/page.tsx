'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { getMcpClient } from '@/lib/mcp-client';
import { Hammer, Loader2, Sparkles, Zap, Box, ArrowRight, X, MessageCircle, LayoutGrid } from 'lucide-react';
import { VoiceChatPopup } from '@/components/VoiceChatPopup';
import { useChatStore } from '@/lib/store';
import { convertToVoiceFriendlyText } from '@/lib/voice-utils';
import { EmbedContent } from '@/components/EmbedContent';
import { getConfig } from '@/nitrochat.config';
import { resolveBrandColor, withMergedRuntimeTheme } from '@/lib/theme-runtime';

export default function TyEmbedPage() {
    const [tools, setTools] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [config, setConfig] = useState<any>(null);
    const [chatOpen, setChatOpen] = useState(false);

    // Voice chat state
    const {
        messages,
        elevenLabsApiKey,
        voiceModeEnabled,
        voiceModel,
        voiceId,
        outputLanguage,
        inputLanguage,
        ttsMuted,
        setElevenLabsApiKey,
        setVoiceModeEnabled,
    } = useChatStore();
    
    const audioRef = useRef<HTMLAudioElement | null>(null);
    type LLMState = 'idle' | 'listening' | 'thinking' | 'speaking';
    const [llmState, setLlmState] = useState<LLMState>('idle');
    const [voiceChatPopupOpen, setVoiceChatPopupOpen] = useState(false);
    const [transcribedText, setTranscribedText] = useState<string | null>(null);
    const [spokenText, setSpokenText] = useState('');
    const hasSpokenGreeting = useRef(false);

    // Fetch config
    useEffect(() => {
        fetch('/api/config')
            .then(res => res.json())
            .then((data) => {
                setConfig(withMergedRuntimeTheme(getConfig(), data));
                // Load ElevenLabs API key from config
                if (data.elevenLabs?.apiKey) {
                    setElevenLabsApiKey(data.elevenLabs.apiKey);
                }
            })
            .catch(err => console.error('Failed to load config:', err));
    }, [setElevenLabsApiKey]);

    // Connect to MCP and fetch tools
    useEffect(() => {
        if (!config) return;

        const initialize = async () => {
            try {
                const client = getMcpClient();

                // Only connect if not already connected
                if (!client.isClientConnected()) {
                    await client.connect({
                        serverUrl: config.mcp.serverUrl,
                        basePath: '/mcp',
                    });
                }

                // Load tools
                const toolsResponse = await client.listTools();
                if (toolsResponse.success && toolsResponse.data) {
                    const toolsList = (toolsResponse.data as any).tools || [];
                    setTools(toolsList);
                }
            } catch (error) {
                console.error('Failed to fetch tools:', error);
            } finally {
                setLoading(false);
            }
        };

        initialize();
    }, [config]);

    // Handle internal "close" messages that EmbedPage might dispatch
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'nitrochat:close') {
                setChatOpen(false);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Listen for voice overlay open event from ChatInputEmbed - open popup mode
    useEffect(() => {
        const handleOpenVoiceOverlay = () => {
            setVoiceChatPopupOpen(true);
            setVoiceModeEnabled(true);
            // Don't set to 'listening' immediately - let greeting play first
        };
        window.addEventListener('open-voice-overlay', handleOpenVoiceOverlay);
        return () => {
            window.removeEventListener('open-voice-overlay', handleOpenVoiceOverlay);
        };
    }, [setVoiceModeEnabled]);

    // Inline TTS function (improved from NitroStudio)
    const playTextToSpeech = useCallback(async (text: string) => {

        if (!elevenLabsApiKey) {
            console.error('❌ No ElevenLabs API key configured');
            return;
        }

        if (!text || ttsMuted) {
            return;
        }

        try {
            setLlmState('speaking');

            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId || '21m00Tcm4TlvDq8ikWAM'}/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': elevenLabsApiKey,
                },
                body: JSON.stringify({
                    text,
                    model_id: voiceModel || 'eleven_multilingual_v2',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                    },
                }),
            });


            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ ElevenLabs API error:', errorText);
                throw new Error(`TTS failed: ${response.status} - ${errorText}`);
            }

            const blob = await response.blob();

            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);

            audio.onended = () => {
                audioRef.current = null;
                URL.revokeObjectURL(url);
                // Add delay before resuming listening to prevent feedback
                setTimeout(() => {
                    setLlmState('listening');
                }, 500);
            };

            audio.onerror = (e) => {
                console.error('❌ Audio playback error:', e);
                audioRef.current = null;
                URL.revokeObjectURL(url);
                // If voice mode is enabled, transition to listening instead of idle
                if (voiceModeEnabled || voiceChatPopupOpen) {
                    setLlmState('listening');
                } else {
                    setLlmState('idle');
                }
            };

            audioRef.current = audio;

            try {
                await audio.play();
            } catch (playError) {
                console.error('❌ Audio play failed (autoplay policy?):', playError);
                audioRef.current = null;
                URL.revokeObjectURL(url);
                // If voice mode is enabled, transition to listening instead of idle
                if (voiceModeEnabled || voiceChatPopupOpen) {
                    setLlmState('listening');
                } else {
                    setLlmState('idle');
                }
            }
        } catch (error) {
            console.error('❌ TTS Error:', error);
            audioRef.current = null;
            // If voice mode is enabled, transition to listening instead of idle
            if (voiceModeEnabled || voiceChatPopupOpen) {
                setLlmState('listening');
            } else {
                setLlmState('idle');
            }
        }
    }, [elevenLabsApiKey, voiceId, voiceModel, ttsMuted, setLlmState]);

    // Auto TTS on assistant messages when voice mode is enabled or popup is open
    useEffect(() => {
        if ((!voiceModeEnabled && !voiceChatPopupOpen) || !elevenLabsApiKey || messages.length === 0 || ttsMuted) return;

        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === 'assistant' && lastMessage.content) {
            // Stop any current audio
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            // Set the text being spoken for overlay display
            const voiceText = convertToVoiceFriendlyText(lastMessage.content);
            setSpokenText(voiceText);
            
            // Play TTS with improved inline function
            playTextToSpeech(voiceText);
        }
    }, [messages, voiceModeEnabled, voiceChatPopupOpen, elevenLabsApiKey, voiceId, voiceModel, ttsMuted, playTextToSpeech]);

    // Handle sending message from voice overlay
    const handleVoiceSendMessage = (text: string) => {
        setLlmState('thinking');
        // Dispatch a custom event that EmbedPage can listen to
        window.dispatchEvent(new CustomEvent('voice-send-message', { detail: { text } }));
    };

    const navTitle = config?.branding?.name || 'NitroChat';

    return (
        <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
            <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
                <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <Link
                            href="/"
                            className="truncate text-sm font-semibold tracking-tight text-foreground hover:text-primary transition-colors duration-150"
                        >
                            {navTitle}
                        </Link>
                        <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
                        <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                            Embed demo
                        </span>
                    </div>
                    <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="Page">
                        <Link
                            href="/"
                            className="rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors duration-150"
                        >
                            Home
                        </Link>
                        <a
                            href="#tools-grid"
                            className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors duration-150 sm:inline-flex"
                        >
                            <LayoutGrid className="h-4 w-4" aria-hidden />
                            Tools
                        </a>
                        <button
                            type="button"
                            onClick={() => setChatOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium shadow-sm hover:opacity-90 transition-opacity duration-150"
                            style={{
                                backgroundColor: 'var(--color-header-bg)',
                                color: 'var(--color-header-text)',
                            }}
                        >
                            <MessageCircle className="h-4 w-4" aria-hidden />
                            <span className="hidden sm:inline">Chat</span>
                        </button>
                    </nav>
                </div>
            </header>

            {/* Hero Section */}
            <div className="relative overflow-hidden border-b border-border/50 bg-card/30">
                <div className="absolute inset-0 bg-grid-white/[0.02] bg-[length:32px_32px]" />
                <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />

                <div className="container mx-auto px-6 py-24 relative z-10">
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
                            <Sparkles className="w-4 h-4" />
                            <span>AI-Powered Capabilities</span>
                        </div>

                        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                            Available Tools
                        </h1>

                        <p className="text-xl text-muted-foreground leading-relaxed mb-10 max-w-2xl">
                            Explore the powerful capabilities available to your AI assistant.
                            These tools enable real-time interaction, data processing, and seamless integration.
                            <br /><span className="text-sm opacity-70 mt-2 block">(Both this page and the chat widget share the same MCP connection)</span>
                        </p>

                        <div className="flex flex-wrap gap-4">
                            <button
                                onClick={() => setChatOpen(true)}
                                className="px-6 py-3 font-semibold rounded-lg hover:opacity-90 transition-colors duration-150 shadow-lg flex items-center gap-2"
                                style={{
                                    backgroundColor: 'var(--color-header-bg)',
                                    color: 'var(--color-header-text)',
                                }}
                            >
                                <MessageCircle className="w-5 h-5" />
                                Start Chatting
                            </button>
                            <a
                                href="#tools-grid"
                                className="px-6 py-3 border border-border hover:bg-muted/50 font-medium rounded-lg transition-colors duration-150 flex items-center gap-2"
                                style={{
                                    backgroundColor: 'var(--color-header-bg)',
                                    color: 'var(--color-header-text)',
                                }}
                            >
                                View Tools <ArrowRight className="w-4 h-4" />
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tools Grid Section */}
            <div id="tools-grid" className="container mx-auto px-6 py-20 pb-32">
                <div className="flex items-center justify-between mb-12">
                    <div>
                        <h2 className="text-3xl font-bold mb-2">System Capabilities</h2>
                        <p className="text-muted-foreground">Detailed breakdown of available AI functions</p>
                    </div>
                    <div 
                        className="px-4 py-2 rounded-lg border border-border text-sm font-mono"
                        style={{
                            backgroundColor: 'var(--color-header-bg)',
                            color: 'var(--color-header-text)',
                        }}
                    >
                        Total Tools: {tools.length}
                    </div>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="h-48 rounded-2xl bg-card/50 opacity-30 border border-border/50" />
                        ))}
                    </div>
                ) : tools.length === 0 ? (
                    <div className="text-center py-20 bg-card/30 rounded-3xl border border-dashed border-border">
                        <Box className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-muted-foreground">No tools available</h3>
                        <p className="text-muted-foreground/60 mt-2">Check your MCP server connection</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {tools.map((tool) => (
                            <div
                                key={tool.name}
                                className="relative p-6 rounded-2xl border border-border bg-card/50 hover:shadow-2xl transition-shadow duration-150 cursor-pointer"
                            >
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                        <Zap className="w-5 h-5" />
                                    </div>
                                    <h3 className="font-bold text-lg font-mono text-foreground/90">
                                        {tool.name}
                                    </h3>
                                </div>

                                <p className="text-muted-foreground leading-relaxed mb-6 min-h-[3rem] text-sm">
                                    {tool.description || 'No description available for this tool.'}
                                </p>

                                {tool.inputSchema && Object.keys(tool.inputSchema.properties || {}).length > 0 && (
                                    <div className="space-y-3 pt-4 border-t border-border/50">
                                        <div className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
                                            Parameters
                                        </div>
                                        <div className="space-y-2">
                                            {Object.keys(tool.inputSchema.properties).slice(0, 3).map(prop => (
                                                <div key={prop} className="flex items-center justify-between text-xs bg-muted/30 px-2 py-1.5 rounded border border-border/50">
                                                    <code className="font-mono text-primary/80">{prop}</code>
                                                    <span className="text-muted-foreground/50 truncate max-w-[120px]">
                                                        {tool.inputSchema.properties[prop].type}
                                                    </span>
                                                </div>
                                            ))}
                                            {Object.keys(tool.inputSchema.properties).length > 3 && (
                                                <div className="text-xs text-muted-foreground/50 text-center italic mt-1">
                                                    +{Object.keys(tool.inputSchema.properties).length - 3} more parameters
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Mobile Drawer Overlay */}
            {chatOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-[9998] md:hidden transition-opacity duration-300"
                    onClick={() => setChatOpen(false)}
                />
            )}

            {/* Direct Embed Component Rendering (Shared Context) */}
            <div className="fixed bottom-5 right-5 z-[9999] font-sans">
                {/* Mobile Drawer Container */}
                <div
                    className={`
                        fixed inset-0 z-[9999]
                        w-full
                        h-full
                        bg-background
                        shadow-2xl
                        rounded-t-2xl
                        border-t border-border
                        transition-transform duration-300 ease-in-out
                        md:hidden
                        overflow-hidden
                        ${chatOpen ? 'translate-y-0' : 'translate-y-full'}
                    `}
                >
                    <EmbedContent className="h-full flex flex-col bg-background text-foreground shadow-none border-none rounded-t-2xl" />
                </div>

                {/* Desktop Widget Container */}
                <div
                    className={`
                        absolute bottom-[80px] right-0 
                        w-[400px] h-[600px] 
                        max-w-[calc(100vw-40px)] max-h-[calc(100vh-100px)] 
                        bg-background rounded-xl overflow-hidden shadow-2xl border border-border
                        transition-all duration-300
                        hidden md:block
                        ${chatOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-90 translate-y-5 pointer-events-none'}
                    `}
                >
                    <EmbedContent className="h-full flex flex-col bg-background text-foreground shadow-none border-none rounded-xl" />
                </div>

                {/* Toggle Button */}
                <button
                    onClick={() => setChatOpen(!chatOpen)}
                    style={{ backgroundColor: 'var(--color-header-bg)' }}
                    className="w-[60px] h-[60px] rounded-full shadow-lg flex items-center justify-center cursor-pointer transition-colors duration-150 border-none outline-none"
                    aria-label="Toggle chat"
                >
                    {chatOpen ? (
                        <X 
                            className="w-7 h-7" 
                            style={{ color: 'var(--color-header-text)' }}
                        />
                    ) : (
                        <MessageCircle 
                            className="w-7 h-7" 
                            style={{ 
                                color: 'var(--color-header-text)',
                                fill: 'var(--color-header-text)' 
                            }}
                        />
                    )}
                </button>
            </div>

            {/* Voice Chat Popup - Render via portal to document.body to ensure it's above everything */}
            {typeof window !== 'undefined' && chatOpen && elevenLabsApiKey && voiceChatPopupOpen && createPortal(
                <VoiceChatPopup
                    isOpen={voiceChatPopupOpen}
                    onClose={() => {
                        setVoiceChatPopupOpen(false);
                        setVoiceModeEnabled(false);
                        setLlmState('idle');
                        hasSpokenGreeting.current = false;
                    }}
                    isSpeaking={llmState === 'speaking'}
                    onGreet={() => {
                        if (hasSpokenGreeting.current) {
                            setLlmState('listening');
                            return;
                        }
                        hasSpokenGreeting.current = true;
                        
                        const LANG_PRESETS: Record<string, { greeting: string }> = {
                            'en': { greeting: 'Hi! How can I help you today?' },
                            'hi': { greeting: 'नमस्ते! मैं आज आपकी कैसे मदद कर सकता हूं?' },
                            'es': { greeting: '¡Hola! ¿Cómo puedo ayudarte hoy?' },
                            'fr': { greeting: 'Bonjour! Comment puis-je vous aider aujourd\'hui?' },
                            'de': { greeting: 'Hallo! Wie kann ich Ihnen heute helfen?' },
                            'ja': { greeting: 'こんにちは！今日はどのようにお手伝いできますか？' },
                            'zh': { greeting: '你好！我今天能帮你什么？' },
                        };
                        const preset = LANG_PRESETS[outputLanguage || 'en'] || LANG_PRESETS['en'];
                        const greeting = preset.greeting;
                        // Set speaking state IMMEDIATELY to prevent speech recognition from capturing greeting audio
                        setLlmState('speaking');
                        setSpokenText(greeting);
                        setVoiceModeEnabled(true);
                        // Play greeting regardless of mute status (welcome message should always play)
                        playTextToSpeech(greeting);
                    }}
                    onTranscript={(text) => {
                        if (text && text.trim()) {
                            // Preserve AUTO_SUBMIT flag if present
                            const isAutoSubmit = text.endsWith('|AUTO_SUBMIT');
                            const cleanText = isAutoSubmit ? text.replace('|AUTO_SUBMIT', '').trim() : text.trim();
                            
                            setTranscribedText(cleanText);
                            // Dispatch to embed page's chat input with flag preserved
                            window.dispatchEvent(new CustomEvent('voice-transcript', { 
                                detail: { text: isAutoSubmit ? cleanText + '|AUTO_SUBMIT' : cleanText } 
                            }));
                            setTimeout(() => {
                                setTranscribedText(null);
                            }, 500);
                        }
                    }}
                    inputLanguage={inputLanguage || 'en-US'}
                />,
                document.body
            )}
        </div>
    );
}
