/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class SpeechService {
  private synth: SpeechSynthesis;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.synth = window.speechSynthesis;
    this.initVoice();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.initVoice();
    }
  }

  private initVoice() {
    const voices = this.synth.getVoices();
    if (voices.length === 0) return;
    
    // Prefer a natural sounding english voice if available
    this.voice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) 
                 || voices.find(v => v.lang.startsWith('en')) 
                 || voices[0];
  }

  speak(text: string) {
    if (!text) return;

    // Cancel any ongoing speech
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Attempt to get voices if not already available
    if (!this.voice) {
      this.initVoice();
    }

    if (this.voice) {
      utterance.voice = this.voice;
    }
    
    utterance.rate = 0.9;
    utterance.pitch = 1;
    
    utterance.onerror = (event) => {
      console.error('SpeechService Error:', event);
    };

    this.synth.speak(utterance);
    console.log('Speaking:', text);
  }

  cancel() {
    this.synth.cancel();
  }
}

export const speechService = new SpeechService();
