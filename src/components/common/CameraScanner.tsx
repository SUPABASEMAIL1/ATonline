import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Zap, ZapOff, Camera, Loader2, RefreshCw, Smartphone, AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface CameraScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  title?: string;
  isContinuous?: boolean;
}

export function CameraScanner({
  onScan,
  onClose,
  title = "Scan Barcode / IMEI",
  isContinuous: initialContinuous = false
}: CameraScannerProps) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'permission' | 'hardware' | 'general' | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [continuousMode, setContinuousMode] = useState(initialContinuous);
  const [availableCameras, setAvailableCameras] = useState<any[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [isContainerReady, setIsContainerReady] = useState(false);
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const [scanMode, setScanMode] = useState<'fast' | 'industrial' | 'all'>('fast');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedText = useRef<string | null>(null);
  const lastScannedTime = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);
  const startAttemptRef = useRef(0);

  const CONTAINER_ID = "qr-reader-container";

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        console.warn("Stop scanner warning:", e);
      } finally {
        scannerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    const checkContainer = () => {
      const el = document.getElementById(CONTAINER_ID);
      if (el && el.offsetParent !== null) {
        setIsContainerReady(true);
      } else {
        setTimeout(checkContainer, 100);
      }
    };
    const timer = setTimeout(checkContainer, 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isContainerReady) {
      handleRetry();
    }
  }, [scanMode]);

  useEffect(() => {
    if (!isContainerReady) return;

    const currentAttempt = ++startAttemptRef.current;
    isMountedRef.current = true;

    const startScanner = async () => {
      if (currentAttempt !== startAttemptRef.current) return;
      if (!isMountedRef.current) return;

      try {
        setError(null);
        setErrorType(null);
        setIsInitializing(true);

        await stopScanner();

        const container = document.getElementById(CONTAINER_ID);
        if (!container) throw new Error("Scanner container not found in DOM");

        let permissionStream: MediaStream | null = null;
        try {
          permissionStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } }
          });
          permissionStream.getTracks().forEach(track => track.stop());
        } catch (permErr: any) {
          const msg = permErr?.message || "";
          if (msg.includes("Permission") || msg.includes("NotAllowed") || permErr.name === "NotAllowedError") {
            setErrorType('permission');
            throw new Error("CAMERA_PERMISSION_DENIED");
          }
        }

        if (!isMountedRef.current || currentAttempt !== startAttemptRef.current) return;

        const fastFormats = [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ];

        const industrialFormats = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ];

        const allSupportedFormats = [
          ...fastFormats,
          ...industrialFormats,
          Html5QrcodeSupportedFormats.AZTEC,
          Html5QrcodeSupportedFormats.PDF_417,
        ];

        const targetFormats = scanMode === 'fast'
          ? fastFormats
          : scanMode === 'industrial'
            ? industrialFormats
            : allSupportedFormats;

        const html5QrCode = new Html5Qrcode(CONTAINER_ID, {
          verbose: false,
          formatsToSupport: targetFormats
        });

        scannerRef.current = html5QrCode;

        const config = {
          fps: 60,
          qrbox: (vw: number, vh: number) => {
            // Optimized for mobile - wider box for alphanumeric codes
            const width = Math.min(vw, vh) * (isMobile ? 0.9 : 0.8);
            const height = isMobile ? 140 : 180;
            return { width, height };
          },
          aspectRatio: 1.777778,
          rememberLastUsedCamera: true,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          videoConstraints: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60 }
          }
        };

        const onScanSuccess = (decodedText: string) => {
          console.log("RAW SCAN:", decodedText);
          if (!isMountedRef.current) return;
          let cleanText = decodedText.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();

          const now = Date.now();
          if (cleanText === lastScannedText.current && now - lastScannedTime.current < 500) return;

          lastScannedText.current = cleanText;
          lastScannedTime.current = now;
          if (navigator.vibrate) navigator.vibrate(100);
          onScan(cleanText);
          if (!continuousMode) onClose();
        };

        let cameras: any[] = [];
        try {
          cameras = await Html5Qrcode.getCameras();
          if (isMountedRef.current) setAvailableCameras(cameras);
        } catch (camErr) { console.warn(camErr); }

        if (!isMountedRef.current || currentAttempt !== startAttemptRef.current) return;

        let started = false;
        if (cameras.length > 0 && !started) {
          try {
            const backCamera = cameras.find(c => {
              const label = c.label.toLowerCase();
              return (label.includes('back') || label.includes('rear') || label.includes('environment')) && !label.includes('front');
            });
            const targetCamera = cameras[currentCameraIndex] || backCamera || cameras[0];
            await html5QrCode.start(targetCamera.id, config, onScanSuccess, () => { });
            started = true;
          } catch (e) { console.warn(e); }
        }

        if (!started) {
          try {
            await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, () => { });
            started = true;
          } catch (e) { console.warn(e); }
        }

        if (!started) throw new Error("All camera start methods failed");

        if (isMountedRef.current) {
          setIsInitializing(false);
          const videoElement = document.querySelector(`#${CONTAINER_ID} video`) as HTMLVideoElement;
          if (videoElement) {
            videoElement.setAttribute('playsinline', 'true');
            videoElement.setAttribute('muted', 'true');
            videoElement.setAttribute('autoplay', 'true');
            videoElement.style.objectFit = 'cover';
          }
          try {
            const track = (html5QrCode as any).getActiveTrack?.();
            if (track) {
              const capabilities = track.getCapabilities?.();
              setHasTorch(!!capabilities?.torch);
            }
          } catch (e) { }
        }
      } catch (err: any) {
        if (!isMountedRef.current) return;
        setError(err?.message || "Scanner failed");
        setIsInitializing(false);
      }
    };

    const timer = setTimeout(startScanner, isMobile ? 600 : 300);
    return () => clearTimeout(timer);
  }, [isContainerReady, currentCameraIndex, continuousMode, stopScanner]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopScanner();
    };
  }, [stopScanner]);

  const handleRetry = useCallback(() => {
    setIsContainerReady(false);
    setError(null);
    setErrorType(null);
    setIsInitializing(true);
    setTimeout(() => setIsContainerReady(true), 300);
  }, []);

  const switchCamera = useCallback(async () => {
    if (availableCameras.length < 2) return;
    await stopScanner();
    setCurrentCameraIndex(prev => (prev + 1) % availableCameras.length);
    setIsContainerReady(false);
    setTimeout(() => setIsContainerReady(true), 300);
  }, [availableCameras.length, stopScanner]);

  const toggleTorch = useCallback(async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const newState = !isTorchOn;
      await (scannerRef.current as any).applyVideoConstraints({ advanced: [{ torch: newState }] });
      setIsTorchOn(newState);
    } catch (e) { }
  }, [hasTorch, isTorchOn]);

  const footer = (
    <div className="flex flex-col gap-4 w-full">
      {/* Scan Mode Switcher */}
      <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
        {(['fast', 'industrial', 'all'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setScanMode(mode)}
            className={`flex-1 py-2.5 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${scanMode === mode ? 'bg-primary text-white shadow-lg shadow-emerald-500/20 scale-[1.02]' : 'text-gray-600 hover:text-white'}`}
          >
            {mode === 'fast' ? '⚡ Fast' : mode === 'industrial' ? '📦 Industrial' : '🌍 All World'}
          </button>
        ))}
      </div>

      {/* Hardware Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2.5">
          <button
            onClick={handleRetry}
            className="p-3.5 bg-white/5 hover:bg-white/10 rounded-2xl transition-all active:scale-90 border border-white/5"
            title="Refresh Engine"
          >
            <RefreshCw className={`w-5 h-5 text-gray-600 ${isInitializing ? 'animate-spin' : ''}`} />
          </button>

          {availableCameras.length > 1 && (
            <button
              onClick={switchCamera}
              className="p-3.5 bg-white/5 hover:bg-white/10 rounded-2xl transition-all active:scale-90 border border-white/5 flex items-center gap-2"
            >
              <Smartphone className="w-5 h-5 text-gray-600" />
              <span className="text-[9px] font-black text-gray-600 uppercase tracking-tighter">{currentCameraIndex + 1}/{availableCameras.length}</span>
            </button>
          )}

          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-3.5 rounded-2xl transition-all active:scale-90 border ${isTorchOn ? 'bg-amber-500 border-amber-600 text-white shadow-lg shadow-amber-500/20' : 'bg-white/5 border-white/5 text-gray-600'}`}
            >
              {isTorchOn ? <ZapOff className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
            </button>
          )}
        </div>

        <button
          onClick={() => setContinuousMode(!continuousMode)}
          className={`px-5 py-3.5 rounded-2xl flex items-center gap-3 transition-all active:scale-95 border ${continuousMode ? 'bg-primary/10 border-primary/30 ring-1 ring-emerald-500/20' : 'bg-white/5 border-white/5'}`}
        >
          <div className={`w-2.5 h-2.5 rounded-full ${continuousMode ? 'bg-primary animate-pulse shadow-[0_0_10px_rgba(16,185,129,1)]' : 'bg-gray-600'}`} />
          <span className={`text-[10px] font-black uppercase tracking-widest ${continuousMode ? 'text-emerald-400' : 'text-gray-600'}`}>
            {continuousMode ? 'Continuous' : 'Single Scan'}
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={title}
      maxWidth="sm"

      footer={footer}
    >
      <style>{`
        #${CONTAINER_ID} canvas { display: none !important; }
        #${CONTAINER_ID} video { object-fit: cover !important; width: 100% !important; height: 100% !important; min-height: 380px !important; }
        #${CONTAINER_ID} { overflow: hidden !important; border-radius: 1.5rem !important; min-height: 380px !important; }
      `}</style>

      <div className="relative bg-[#000] overflow-hidden flex-1 min-h-[380px] sm:min-h-[420px] flex items-center justify-center rounded-[2rem]">
        {isInitializing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20 bg-[#000]">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-[10px] font-black text-primary uppercase tracking-widest animate-pulse">Initializing Engine...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 gap-6 z-20 bg-[#000]">
            <div className="w-16 h-16 bg-rose-500/10 rounded-3xl flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-rose-500" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-white font-black text-sm uppercase tracking-tight">Access Restricted</p>
              <p className="text-gray-600 text-[10px] font-bold uppercase leading-relaxed max-w-[200px] mx-auto">{error}</p>
            </div>
            <button
              onClick={handleRetry}
              className="btn btn-md btn-primary"
            >
              Restart Engine
            </button>
          </div>
        )}

        <div id={CONTAINER_ID} ref={containerRef} className="w-full h-full absolute inset-0 z-0" style={{ visibility: (isInitializing || error) ? 'hidden' : 'visible' }} />

        {!isInitializing && !error && (
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
            <div className="relative" style={{ width: isMobile ? '90%' : '300px', height: isMobile ? '140px' : '180px', maxWidth: '340px' }}>
              <div className="absolute -top-1 -left-1 w-10 h-10 border-t-[4px] border-l-[4px] border-primary rounded-tl-2xl shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
              <div className="absolute -top-1 -right-1 w-10 h-10 border-t-[4px] border-r-[4px] border-primary rounded-tr-2xl shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
              <div className="absolute -bottom-1 -left-1 w-10 h-10 border-b-[4px] border-l-[4px] border-primary rounded-bl-2xl shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
              <div className="absolute -bottom-1 -right-1 w-10 h-10 border-b-[4px] border-r-[4px] border-primary rounded-br-2xl shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
              <div className="absolute inset-x-0 h-[2.5px] bg-emerald-400 shadow-[0_0_25px_rgba(16,185,129,1)] animate-scan opacity-90" />
              <div className="absolute inset-0 bg-primary/10 rounded-2xl ring-1 ring-emerald-500/30" />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}