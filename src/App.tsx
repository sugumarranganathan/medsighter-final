/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, TouchEvent, useRef } from 'react';
import { Pill, FileText, CheckCircle2, AlertCircle, RefreshCw, Home, Search, Info, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeExpiry, verifyPrescription, ExpiryResult, VerificationResult } from './services/ocrService';
import { speechService } from './services/speechService';
import { voiceControlService } from './services/voiceControlService';
import CameraView from './components/CameraView';

type AppState = 'IDLE' | 'EXPIRY_SCAN' | 'PRESCRIPTION_SCAN' | 'MEDICINE_SCAN' | 'PROCESSING' | 'RESULT';

export default function App() {
  const [state, setState] = useState<AppState>('IDLE');
  const stateRef = useRef<AppState>(state);
  const [loading, setLoading] = useState(false);
  const [expiryResult, setExpiryResult] = useState<ExpiryResult | null>(null);
  const expiryResultRef = useRef<ExpiryResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const verifyResultRef = useRef<VerificationResult | null>(null);
  const [prescriptionImg, setPrescriptionImg] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const didMount = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    expiryResultRef.current = expiryResult;
  }, [expiryResult]);

  useEffect(() => {
    verifyResultRef.current = verifyResult;
  }, [verifyResult]);

  const playWelcome = () => {
    speechService.speak("Welcome to Med Sighter. I am here to help you manage your medicine safely. " + 
      "There are two main options. " +
      "Option 1: Check Expiry. Scan medicine box. Say Option 1 for Check Expiry option. " +
      "Option 2: Verify Match. Scan Prescription and Medicine. Say Option 2 for Verify Match Option. " +
      "When the camera opens, I will count down from ten and capture the photo automatically. " +
      "Please listen for the numbers.");
  };

  const [isMicActive, setIsMicActive] = useState(false);
  const [isMicBlocked, setIsMicBlocked] = useState(false);

  const startApp = () => {
    setHasStarted(true);
    
    // Start voice control after user interaction
    voiceControlService.start((command) => {
      console.log('Voice Command in App:', command);
      speechService.cancel();
      if (command === 'START') {
        if (stateRef.current === 'IDLE') {
          playWelcome();
        } else {
          reset(true);
        }
      } else if (command === 'STOP') {
        reset(false);
      } else if (command === 'OPTION 1') {
        if (stateRef.current === 'IDLE') {
          setState('EXPIRY_SCAN');
        }
      } else if (command === 'OPTION 2') {
        if (stateRef.current === 'IDLE') {
          setState('PRESCRIPTION_SCAN');
        }
      } else if (command === 'REPEAT') {
        const text = expiryResultRef.current?.message || verifyResultRef.current?.instructions || "";
        if (text) {
          speechService.speak(text);
        }
      }
    });

    // Start checking mic status
    const checkMicStatus = setInterval(() => {
      setIsMicActive(voiceControlService.isActive());
      setIsMicBlocked(voiceControlService.isPermissionBlocked());
    }, 1000);

    // Save interval to cleanup if needed, though this app usually stays started
    (window as any)._micInterval = checkMicStatus;

    playWelcome();
  };

  useEffect(() => {
    return () => {
      voiceControlService.stop();
      if ((window as any)._micInterval) {
        clearInterval((window as any)._micInterval);
      }
    };
  }, []);

  const handleExpiryScan = async (base64: string) => {
    setLoading(true);
    setState('PROCESSING');
    try {
      const result = await analyzeExpiry(base64);
      setExpiryResult(result);
      setState('RESULT');
      speechService.speak(result.message);
    } catch (error) {
      console.error(error);
      speechService.speak("Sorry, I couldn't analyze that photo. Please try again with better lighting.");
      setState('IDLE');
    } finally {
      setLoading(false);
    }
  };

  const handlePrescriptionScan = (base64: string) => {
    setPrescriptionImg(base64);
    setState('MEDICINE_SCAN');
    speechService.speak("Capture finished. Now show me the medicine. I will capture it in ten seconds.");
  };

  const handleMedicineScan = async (base64: string) => {
    if (!prescriptionImg) return;
    setLoading(true);
    setState('PROCESSING');
    try {
      const result = await verifyPrescription(prescriptionImg, base64);
      setVerifyResult(result);
      setState('RESULT');
      speechService.speak(result.instructions);
    } catch (error) {
      console.error(error);
      speechService.speak("Sorry, I couldn't compare the images. Please try again with clearer photos.");
      setState('IDLE');
    } finally {
      setLoading(false);
    }
  };

  const reset = (shouldSpeakWelcome = false) => {
    setState('IDLE');
    setExpiryResult(null);
    setVerifyResult(null);
    setPrescriptionImg(null);
    setLoading(false);
    if (shouldSpeakWelcome) {
      playWelcome();
    }
  };

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e: TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isRightSwipe) {
      // Swipe Left to Right -> START
      speechService.cancel();
      if (state === 'IDLE') {
        playWelcome();
      } else {
        reset(true);
      }
      console.log('Swipe: Left to Right (START)');
    } else if (isLeftSwipe) {
      // Swipe Right to Left -> STOP
      speechService.cancel();
      reset(false);
      console.log('Swipe: Right to Left (STOP)');
    }
  };

  if (!hasStarted) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-black mb-12 uppercase tracking-[0.5em] text-zinc-500">MedSighter</h1>
        <button 
          onClick={startApp}
          className="w-full max-w-2xl bg-white text-black py-20 rounded-[80px] text-6xl font-black uppercase shadow-2xl active:scale-95 transition-all border-b-[20px] border-zinc-300"
        >
          Start Assistant
        </button>
        <p className="mt-12 text-zinc-500 font-bold uppercase tracking-[0.3em] text-2xl flex items-center gap-4">
          <Info size={32} /> Tap to enable voice & audio
        </p>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-black text-white p-6 font-sans"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <AnimatePresence mode="wait">
        {state === 'IDLE' && (
          <motion.div 
            key="idle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col h-full space-y-8"
          >
            <header className="py-2 flex justify-between items-center border-b border-white/5">
              <div>
                <h1 className="text-[8px] font-black tracking-[0.3em] uppercase text-zinc-700">MedSighter</h1>
                <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest flex items-center gap-1">
                  <Info size={8} /> Accessible Health Assistant
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isMicBlocked && (
                  <button 
                    onClick={() => voiceControlService.requestPermission()}
                    className="bg-red-600 text-white text-[10px] px-2 py-1 rounded-full animate-bounce font-bold"
                  >
                    Allow Mic
                  </button>
                )}
                <div className={`p-2 rounded-full ${isMicActive ? 'bg-green-500/20 text-green-500 animate-pulse' : 'bg-red-500/20 text-red-500'}`}>
                  {isMicActive ? <Mic size={16} /> : <MicOff size={16} />}
                </div>
              </div>
            </header>

            <div className="flex-1 flex flex-col gap-4 py-4">
              <button 
                id="btn-expiry"
                onClick={() => setState('EXPIRY_SCAN')}
                className="flex-1 bg-white hover:bg-zinc-100 text-black rounded-[40px] transition-all flex flex-col items-center justify-center gap-8 text-center border-b-[16px] border-zinc-300 active:border-b-0 active:translate-y-4 group shadow-2xl"
                aria-label="Check if medicine is expired"
              >
                <RefreshCw className="w-32 h-32 group-hover:rotate-180 transition-transform duration-700" />
                <div>
                  <h2 className="text-7xl font-black uppercase leading-tight bg-black text-white px-8 py-2">Check Expiry</h2>
                  <p className="text-3xl font-bold mt-4 uppercase tracking-[0.2em] text-zinc-600">Scan medicine box</p>
                </div>
              </button>

              <button 
                id="btn-match"
                onClick={() => setState('PRESCRIPTION_SCAN')}
                className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black rounded-[40px] transition-all flex flex-col items-center justify-center gap-8 text-center border-b-[16px] border-yellow-600 active:border-b-0 active:translate-y-4 group shadow-2xl"
                aria-label="Verify pharmacists medicine matches prescription"
              >
                <FileText className="w-32 h-32" />
                <div>
                  <h2 className="text-7xl font-black uppercase leading-tight bg-black text-yellow-400 px-8 py-2">Verify Match</h2>
                  <p className="text-3xl font-bold mt-4 uppercase tracking-[0.2em] text-yellow-900">Scan Rx + Medicine</p>
                </div>
              </button>
            </div>

            <footer className="py-8 text-center border-t-2 border-white/10">
              <p className="text-zinc-500 font-mono text-xs uppercase">Always consult a doctor before consuming medicine.</p>
            </footer>
          </motion.div>
        )}

        {state === 'EXPIRY_SCAN' && (
          <CameraView 
            label="Medicine"
            onCapture={handleExpiryScan}
            onClose={() => setState('IDLE')}
          />
        )}

        {state === 'PRESCRIPTION_SCAN' && (
          <CameraView 
            label="Prescription"
            onCapture={handlePrescriptionScan}
            onClose={() => setState('IDLE')}
          />
        )}

        {state === 'MEDICINE_SCAN' && (
          <CameraView 
            label="Medicine" 
            onCapture={handleMedicineScan}
            onClose={() => setState('IDLE')}
            silentStart
          />
        )}

        {state === 'PROCESSING' && (
          <motion.div 
            key="processing"
            className="fixed inset-0 flex flex-col items-center justify-center p-12 text-center"
          >
            <div className="w-32 h-32 border-8 border-white border-t-yellow-400 rounded-full animate-spin mb-8" />
            <h2 className="text-4xl font-black uppercase mb-4">Analyzing</h2>
            <p className="text-xl text-zinc-400">Using AI to examine your photos. Please wait.</p>
          </motion.div>
        )}

        {state === 'RESULT' && (
          <motion.div 
            key="result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col min-h-screen"
          >
            <div className="flex-1 p-6 space-y-8 flex flex-col justify-center">
              {expiryResult && (
                <div className={`high-contrast-card ${expiryResult.isExpired ? 'border-red-500' : 'border-green-500'}`}>
                  <div className="flex items-center gap-4 mb-6">
                    {expiryResult.isExpired ? (
                      <AlertCircle size={64} className="text-red-500" />
                    ) : (
                      <CheckCircle2 size={64} className="text-green-500" />
                    )}
                    <div>
                      <h3 className="text-4xl font-black uppercase leading-tight">{expiryResult.medicineName}</h3>
                      <p className="text-2xl font-mono opacity-80">{expiryResult.expiryDate}</p>
                    </div>
                  </div>
                  <p className="text-3xl font-bold leading-relaxed">{expiryResult.message}</p>
                </div>
              )}

              {verifyResult && (
                <div className={`high-contrast-card ${verifyResult.isMatch ? 'border-green-500' : 'border-red-500'}`}>
                   <div className="flex items-center gap-4 mb-6">
                    {verifyResult.isMatch ? (
                      <CheckCircle2 size={64} className="text-green-500" />
                    ) : (
                      <AlertCircle size={64} className="text-red-500" />
                    )}
                    <div>
                      <h3 className="text-4xl font-black uppercase leading-tight">Verification</h3>
                      <p className="text-xl font-bold uppercase opacity-60">Result: {verifyResult.isMatch ? 'Matched' : 'Mismatch'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-zinc-900 p-4 rounded-xl border-2 border-white/20">
                      <p className="text-xs uppercase text-zinc-400 mb-1">Prescribed</p>
                      <p className="text-xl font-bold">{verifyResult.prescriptionMedicine}</p>
                    </div>
                    <div className="bg-zinc-900 p-4 rounded-xl border-2 border-white/20">
                      <p className="text-xs uppercase text-zinc-400 mb-1">Pharmacist Gave</p>
                      <p className="text-xl font-bold">{verifyResult.actualMedicine}</p>
                    </div>
                  </div>

                  <p className="text-2xl font-bold leading-relaxed bg-zinc-900 p-6 rounded-2xl">
                    {verifyResult.instructions}
                  </p>
                  
                  {!verifyResult.isMatch && verifyResult.discrepancies && (
                    <div className="mt-6 p-4 border-l-8 border-red-500 bg-red-950/20">
                      <p className="font-bold text-red-400">{verifyResult.discrepancies}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-8 space-y-4">
              <button onClick={() => speechService.speak(expiryResult?.message || verifyResult?.instructions || "")} className="secondary-action">
                Repeat Instructions
              </button>
              <button 
                onClick={reset}
                className="primary-action bg-white text-black"
                aria-label="Back to home"
              >
                <Home size={32} />
                <span>Finished</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
