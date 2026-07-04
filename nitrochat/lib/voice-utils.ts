/**
 * Convert markdown content to voice-friendly text
 */
export function convertToVoiceFriendlyText(text: string): string {
  if (!text) return '';

  let result = text;

  // Remove code blocks
  result = result.replace(/```[\s\S]*?```/g, '');
  result = result.replace(/`[^`]+`/g, '');

  // Remove tables
  result = result.replace(/\|[\s\S]*?\|/g, '');

  // Remove markdown formatting
  result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
  result = result.replace(/\*([^*]+)\*/g, '$1');
  result = result.replace(/__([^_]+)__/g, '$1');
  result = result.replace(/_([^_]+)_/g, '$1');
  result = result.replace(/^#{1,6}\s+/gm, '');

  // Remove links, keep text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Clean up whitespace
  result = result.replace(/\n{2,}/g, '. ');
  result = result.replace(/\n/g, ', ');
  result = result.replace(/\s{2,}/g, ' ');

  // Limit to 80 words
  const words = result.split(/\s+/).filter(w => w.length > 0);
  if (words.length > 80) {
    result = words.slice(0, 80).join(' ') + '. Would you like more details?';
  }

  return result.trim();
}

/**
 * Play text-to-speech using ElevenLabs API
 */
export async function playTextToSpeech(
  text: string,
  apiKey: string,
  voiceId: string,
  modelId: string
): Promise<HTMLAudioElement | null> {
  if (!apiKey || !text) return Promise.resolve(null);

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS failed: ${response.status} - ${errorText}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    return new Promise<HTMLAudioElement>((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve(audio);
      };
      audio.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      audio.play().catch(reject);
    });
  } catch (error) {
    console.error('TTS Error:', error);
    throw error;
  }
}

