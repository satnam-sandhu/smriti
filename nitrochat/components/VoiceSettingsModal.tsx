'use client';

import { useState, useEffect } from 'react';
import { X, Volume2, Mic, Languages, Radio, Headphones, Loader2, Sparkles } from 'lucide-react';
import { useChatStore } from '@/lib/store';
import { cn } from '@/lib/utils';

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme?: 'dark' | 'light';
}

interface ElevenLabsModel {
  model_id: string;
  name: string;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  labels?: { accent?: string; language?: string };
}

const LANG_PRESETS: Record<string, { model: string; voice: string; input: string; name: string; flag: string }> = {
  'en': { model: 'eleven_flash_v2_5', voice: '21m00Tcm4TlvDq8ikWAM', input: 'en-US', name: 'English', flag: '🇺🇸' },
  'hi': { model: 'eleven_multilingual_v2', voice: 'C2S5J6WvmHnrQWjUu6Rg', input: 'hi-IN', name: 'Hindi', flag: '🇮🇳' },
  'es': { model: 'eleven_multilingual_v2', voice: 'ErXwobaYiN019PkySvjV', input: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
  'fr': { model: 'eleven_multilingual_v2', voice: 'CwhRBWXzGAHq8TQ4Fs17', input: 'fr-FR', name: 'French', flag: '🇫🇷' },
  'de': { model: 'eleven_multilingual_v2', voice: 'EXAVITQu4vr4xnSDxMaL', input: 'de-DE', name: 'German', flag: '🇩🇪' },
  'ja': { model: 'eleven_multilingual_v2', voice: 'MF3mGyEYCl7XYWbV9V6O', input: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
  'zh': { model: 'eleven_multilingual_v2', voice: 'TxGEqnHWrfWFTfGW9XjX', input: 'zh-CN', name: 'Chinese', flag: '🇨🇳' },
};

const INPUT_LANGUAGES = [
  { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
  { code: 'en-GB', name: 'English (UK)', flag: '🇬🇧' },
  { code: 'hi-IN', name: 'Hindi', flag: '🇮🇳' },
  { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
  { code: 'de-DE', name: 'German', flag: '🇩🇪' },
  { code: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
];

function SettingCard({
  icon: Icon,
  title,
  description,
  children,
  isLight,
}: {
  icon: any;
  title: string;
  description?: string;
  children: React.ReactNode;
  isLight?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3 transition-colors",
      isLight
        ? "bg-gray-50/80 border-gray-200 hover:border-gray-300"
        : "bg-white/[0.03] border-white/[0.06] hover:border-white/[0.1]"
    )}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/15 to-accent/10 border border-primary/15 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className={cn("text-sm font-medium", isLight ? "text-gray-800" : "text-foreground")}>{title}</h3>
          {description && (
            <p className={cn("text-[11px] leading-tight mt-0.5", isLight ? "text-gray-400" : "text-muted/50")}>{description}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function StyledSelect({
  value,
  onChange,
  children,
  disabled,
  isLight,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  disabled?: boolean;
  isLight?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={cn(
        'w-full appearance-none rounded-lg px-3.5 py-2.5 pr-9 text-xs font-medium',
        'focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40',
        'transition-all duration-150 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        isLight
          ? 'bg-white border border-gray-200 text-gray-800 hover:border-gray-300 hover:bg-gray-50'
          : 'bg-white/[0.04] border border-white/[0.08] text-foreground hover:border-white/[0.14] hover:bg-white/[0.06]'
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
      }}
    >
      {children}
    </select>
  );
}

export function VoiceSettingsModal({ isOpen, onClose, currentTheme = 'dark' }: VoiceSettingsModalProps) {
  const isLight = currentTheme === 'light';
  const {
    elevenLabsApiKey,
    voiceModeType,
    voiceModel,
    voiceId,
    outputLanguage,
    inputLanguage,
    setVoiceModeType,
    setVoiceModel,
    setVoiceId,
    setOutputLanguage,
    setInputLanguage,
  } = useChatStore();

  const [availableModels, setAvailableModels] = useState<ElevenLabsModel[]>([]);
  const [availableVoices, setAvailableVoices] = useState<ElevenLabsVoice[]>([]);
  const [loadingVoiceData, setLoadingVoiceData] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedModel = localStorage.getItem('voice_model');
      const savedVoiceId = localStorage.getItem('voice_id');
      const savedOutputLang = localStorage.getItem('output_language');
      const savedInputLang = localStorage.getItem('input_language');

      if (savedModel) setVoiceModel(savedModel);
      if (savedVoiceId) setVoiceId(savedVoiceId);
      if (savedOutputLang) setOutputLanguage(savedOutputLang);
      if (savedInputLang) setInputLanguage(savedInputLang);
    }
  }, [setVoiceModel, setVoiceId, setOutputLanguage, setInputLanguage]);

  // Fetch models when modal opens
  useEffect(() => {
    if (!isOpen || !elevenLabsApiKey) return;

    const fetchModels = async () => {
      try {
        const res = await fetch('https://api.elevenlabs.io/v1/models', {
          headers: { 'xi-api-key': elevenLabsApiKey },
        });
        if (res.ok) {
          const data = await res.json();
          setAvailableModels(data);
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
      }
    };

    fetchModels();
  }, [isOpen, elevenLabsApiKey]);

  // Fetch voices when language changes
  useEffect(() => {
    if (!isOpen || !elevenLabsApiKey) return;

    const fetchVoices = async () => {
      setLoadingVoiceData(true);
      try {
        const langMap: Record<string, string> = {
          en: 'en', hi: 'hi', es: 'es', fr: 'fr', de: 'de',
          ja: 'ja', ko: 'ko', zh: 'zh', pt: 'pt', it: 'it',
        };
        const langCode = langMap[outputLanguage] || 'en';

        const userRes = await fetch('https://api.elevenlabs.io/v1/voices', {
          headers: { 'xi-api-key': elevenLabsApiKey },
        });
        let userVoices: ElevenLabsVoice[] = [];
        if (userRes.ok) {
          const data = await userRes.json();
          userVoices = data.voices || [];
        }

        const sharedRes = await fetch(
          `https://api.elevenlabs.io/v1/shared-voices?language=${langCode}&page_size=50`,
          { headers: { 'xi-api-key': elevenLabsApiKey } }
        );
        let sharedVoices: ElevenLabsVoice[] = [];
        if (sharedRes.ok) {
          const data = await sharedRes.json();
          sharedVoices = (data.voices || []).map((v: any) => ({
            voice_id: v.voice_id,
            name: v.name,
            labels: { accent: v.accent || v.language },
          }));
        }

        setAvailableVoices([...userVoices, ...sharedVoices]);
      } catch (err) {
        console.error('Failed to fetch voices:', err);
      } finally {
        setLoadingVoiceData(false);
      }
    };

    fetchVoices();
  }, [isOpen, elevenLabsApiKey, outputLanguage]);

  if (!isOpen || !elevenLabsApiKey) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md",
        isLight ? "bg-black/30" : "bg-black/70"
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          'w-[480px] max-h-[90vh] overflow-hidden rounded-2xl',
          'shadow-2xl flex flex-col',
          'animate-in fade-in zoom-in-95 duration-200',
          isLight
            ? 'bg-white border border-gray-200 shadow-gray-300/40'
            : 'bg-[#0f0f0f] border border-white/[0.08] shadow-black/80'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={cn(
          "relative px-6 pt-6 pb-4 border-b",
          isLight ? "border-gray-100" : "border-white/[0.06]"
        )}>
          {/* Subtle gradient glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-primary/8 blur-3xl rounded-full pointer-events-none" />

          <div className="flex items-center justify-between relative">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 via-accent/15 to-primary/5 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className={cn(
                  "text-lg font-semibold tracking-tight",
                  isLight ? "text-gray-900" : "text-foreground"
                )}>
                  Voice Settings
                </h2>
                <p className={cn(
                  "text-[11px] mt-0.5",
                  isLight ? "text-gray-400" : "text-muted/40"
                )}>
                  Powered by ElevenLabs
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={cn(
                'p-2 rounded-lg transition-all duration-150',
                isLight
                  ? 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'
                  : 'hover:bg-white/[0.06] text-muted/40 hover:text-foreground'
              )}
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-5 space-y-4">
          {/* Voice Mode */}
          <SettingCard icon={Radio} title="Voice Mode" description="Choose how voice interaction works" isLight={isLight}>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  value: 'voice-only' as const,
                  label: 'Voice Only',
                  desc: 'Full screen voice',
                  icon: Headphones,
                },
                {
                  value: 'voice-chat' as const,
                  label: 'Voice + Chat',
                  desc: 'Popup transcription',
                  icon: Mic,
                },
              ].map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setVoiceModeType(mode.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-3.5 rounded-lg border transition-all duration-150',
                    voiceModeType === mode.value
                      ? 'bg-primary/[0.08] border-primary/30 text-primary shadow-sm shadow-primary/5'
                      : isLight
                        ? 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                        : 'bg-white/[0.02] border-white/[0.06] text-muted/60 hover:border-white/[0.12] hover:bg-white/[0.04]'
                  )}
                >
                  <mode.icon
                    className={cn(
                      'w-5 h-5',
                      voiceModeType === mode.value ? 'text-primary' : 'text-muted/40'
                    )}
                  />
                  <div className="text-center">
                    <div className="text-xs font-medium">{mode.label}</div>
                    <div className="text-[10px] text-muted/40 mt-0.5">{mode.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </SettingCard>

          {/* Voice Engine */}
          <SettingCard icon={Volume2} title="Voice Engine" description="Select TTS model and voice character" isLight={isLight}>
            <div className="space-y-3">
              <div>
                <label className={cn(
                  "block text-[10px] font-semibold uppercase tracking-widest mb-1.5 px-0.5",
                  isLight ? "text-gray-400" : "text-muted/40"
                )}>
                  Model
                </label>
                <StyledSelect value={voiceModel} onChange={(e) => setVoiceModel(e.target.value)} isLight={isLight}>
                  {availableModels.length > 0 ? (
                    availableModels
                      .filter((m) => m.model_id.includes('eleven'))
                      .map((model) => (
                        <option key={model.model_id} value={model.model_id}>
                          {model.name}
                        </option>
                      ))
                  ) : (
                    <>
                      <option value="eleven_multilingual_v2">Multilingual v2</option>
                      <option value="eleven_flash_v2_5">Flash v2.5</option>
                      <option value="eleven_turbo_v2_5">Turbo v2.5</option>
                    </>
                  )}
                </StyledSelect>
              </div>

              <div>
                <label className={cn(
                  "block text-[10px] font-semibold uppercase tracking-widest mb-1.5 px-0.5",
                  isLight ? "text-gray-400" : "text-muted/40"
                )}>
                  Voice Character
                </label>
                <div className="relative">
                  <StyledSelect
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    disabled={loadingVoiceData}
                    isLight={isLight}
                  >
                    {loadingVoiceData ? (
                      <option>Loading voices...</option>
                    ) : availableVoices.length > 0 ? (
                      availableVoices.map((voice) => (
                        <option key={voice.voice_id} value={voice.voice_id}>
                          {voice.name}
                          {voice.labels?.accent ? ` (${voice.labels.accent})` : ''}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="21m00Tcm4TlvDq8ikWAM">Rachel (English)</option>
                        <option value="EXAVITQu4vr4xnSDxMaL">Bella (English)</option>
                      </>
                    )}
                  </StyledSelect>
                  {loadingVoiceData && (
                    <div className="absolute right-9 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary/50" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </SettingCard>

          {/* Language */}
          <SettingCard icon={Languages} title="Language" description="Set input and output language" isLight={isLight}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={cn(
                  "block text-[10px] font-semibold uppercase tracking-widest mb-1.5 px-0.5",
                  isLight ? "text-gray-400" : "text-muted/40"
                )}>
                  Output
                </label>
                <StyledSelect
                  value={outputLanguage}
                  onChange={(e) => {
                    const lang = e.target.value;
                    const preset = LANG_PRESETS[lang];
                    if (preset) {
                      setOutputLanguage(lang);
                      setVoiceModel(preset.model);
                      setVoiceId(preset.voice);
                      setInputLanguage(preset.input);
                    }
                  }}
                  isLight={isLight}
                >
                  {Object.entries(LANG_PRESETS).map(([code, preset]) => (
                    <option key={code} value={code}>
                      {preset.flag} {preset.name}
                    </option>
                  ))}
                </StyledSelect>
              </div>

              <div>
                <label className={cn(
                  "block text-[10px] font-semibold uppercase tracking-widest mb-1.5 px-0.5",
                  isLight ? "text-gray-400" : "text-muted/40"
                )}>
                  Input
                </label>
                <StyledSelect
                  value={inputLanguage}
                  onChange={(e) => setInputLanguage(e.target.value)}
                  isLight={isLight}
                >
                  {INPUT_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name}
                    </option>
                  ))}
                </StyledSelect>
              </div>
            </div>
          </SettingCard>
        </div>

        {/* Footer */}
        <div className={cn(
          "px-6 py-4 border-t flex items-center justify-between",
          isLight ? "border-gray-100" : "border-white/[0.06]"
        )}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className={cn(
              "text-[11px]",
              isLight ? "text-gray-400" : "text-muted/40"
            )}>ElevenLabs connected</span>
          </div>
          <button
            onClick={onClose}
            className={cn(
              'px-5 py-2 rounded-lg text-xs font-medium transition-all duration-150',
              'bg-primary/10 text-primary border border-primary/20',
              'hover:bg-primary/20 hover:border-primary/30'
            )}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
