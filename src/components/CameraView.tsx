/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useEffect, useState } from 'react';
import { Camera, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { speechService } from '../services/speechService';

interface CameraViewProps {
  onCapture: (base64: string) => void | Promise<void>;
  onClose: () => void;
  label: string;
  silentStart?: boolean;
}

export default function CameraView({ onCapture, onClose, label, silentStart }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!silentStart) {
      speechService.speak(`Show me the ${label}. I will capture it automatically in ten seconds.`);
    }
    
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsReady(true);
          // Start countdown after camera is ready
          setCountdown(10);
        }
      } catch (err) {
        console.error(err);
        setError("Could not access camera. Please check permissions.");
        speechService.speak("Could not access camera. Please check permissions.");
      }
    }
    startCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [label]);

  useEffect(() => {
    if (countdown === null || !isReady) return;

    if (countdown > 0) {
      const timer = setTimeout(() => {
        const nextCount = countdown - 1;
        setCountdown(nextCount);
        if (nextCount > 0) {
          speechService.speak(nextCount.toString());
        }
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      capture();
    }
  }, [countdown, isReady]);

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const context = canvasRef.current.getContext('2d');
    if (!context) return;

    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);

    const base64 = canvasRef.current.toDataURL('image/jpeg', 0.95).split(',')[1];
    speechService.speak("Capture finished.");
    onCapture(base64);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black z-50 flex flex-col"
    >
      <div className="p-4 flex justify-between items-center bg-black/80">
        <h2 className="text-xl font-bold uppercase tracking-tight">{label}</h2>
        <button 
          onClick={onClose} 
          className="p-4 a11y-touch-target"
          aria-label="Close camera"
        >
          <X size={48} />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden bg-zinc-900 border-x-4 border-white flex items-center justify-center">
        {error ? (
          <p className="text-center p-8 text-xl font-bold text-red-500">{error}</p>
        ) : (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className={`w-full h-full object-cover ${!isReady ? 'hidden' : ''}`}
            />
            {isReady && (
              <div className="absolute inset-0 pointer-events-none border-[40px] border-black/50 flex items-center justify-center">
                <div className="w-64 h-64 border-4 border-yellow-400 relative">
                  <div className="scan-ring"></div>
                </div>
              </div>
            )}
            {!isReady && <div className="text-2xl animate-pulse">Initializing Camera...</div>}
            {countdown !== null && countdown > 0 && (
              <motion.div 
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1.5, opacity: 1 }}
                key={countdown}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <span className="text-9xl font-black text-yellow-400 drop-shadow-[0_0_20px_rgba(0,0,0,1)]">
                  {countdown}
                </span>
              </motion.div>
            )}
          </>
        )}
      </div>

      <div className="p-8 bg-black">
        <button 
          onClick={capture}
          disabled={!isReady}
          className="primary-action"
          aria-label={`Take photo of ${label}`}
        >
          <Camera size={40} />
          <span>Capture Photo</span>
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </motion.div>
  );
}
