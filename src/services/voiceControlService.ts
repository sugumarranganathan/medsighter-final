/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

type VoiceCommandCallback = (command: 'STOP' | 'START' | 'OPTION 1' | 'OPTION 2' | 'REPEAT') => void;

class VoiceControlService {
  private recognition: any = null;
  private onCommand: VoiceCommandCallback | null = null;
  private isListening = false;
  private isStarted = false;
  private isBlocked = false;

  constructor() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false; // Non-continuous often more reliable
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isStarted = true;
        this.isBlocked = false;
        console.log('Voice control active');
      };

      this.recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript.trim().toUpperCase();
        console.log('Voice Command heard:', text);

        if (text.includes('STOP')) {
          console.log('Detected STOP command');
          this.onCommand?.('STOP');
        } else if (text.includes('START')) {
          console.log('Detected START command');
          this.onCommand?.('START');
        } else if (text.includes('OPTION 1') || text.includes('ONE')) {
          console.log('Detected OPTION 1 command');
          this.onCommand?.('OPTION 1');
        } else if (text.includes('OPTION 2') || text.includes('TWO')) {
          console.log('Detected OPTION 2 command');
          this.onCommand?.('OPTION 2');
        } else if (text.includes('REPEAT')) {
          console.log('Detected REPEAT command');
          this.onCommand?.('REPEAT');
        }
      };

      this.recognition.onend = () => {
        this.isStarted = false;
        console.log('Voice recognition ended');
        if (this.isListening && !this.isBlocked) {
          // Restart immediately for seamless listening
          this.safeStart();
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') {
          // Normal timeout, will restart in onend
          return;
        }
        if (event.error === 'aborted') return;
        
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this.isListening = false;
          this.isBlocked = true;
        }
      };
    }
  }

  private safeStart() {
    if (!this.recognition || !this.isListening || this.isStarted || this.isBlocked) return;
    
    try {
      this.recognition.start();
    } catch (e: any) {
      if (e?.name === 'InvalidStateError' || e?.message?.includes('already started')) {
        this.isStarted = true;
      } else {
        console.error('Failed to start recognition:', e);
      }
    }
  }

  start(callback: VoiceCommandCallback) {
    this.onCommand = callback;
    if (this.recognition && !this.isListening) {
      this.isListening = true;
      this.isBlocked = false;
      this.safeStart();
    }
  }

  stop() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignore errors during stop
      }
    }
  }

  isActive() {
    return this.isStarted;
  }

  isPermissionBlocked() {
    return this.isBlocked;
  }

  requestPermission() {
    this.isBlocked = false;
    this.isListening = true;
    this.safeStart();
  }
}

export const voiceControlService = new VoiceControlService();
