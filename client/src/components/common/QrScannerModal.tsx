import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, RefreshCw, Upload, X, QrCode, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (rawValue: string) => void;
}

export function QrScannerModal({ open, onClose, onDetected }: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [startingCamera, setStartingCamera] = useState(false);
  const [manualInput, setManualInput] = useState('');

  useEffect(() => {
    if (!open) return;

    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    let active = true;

    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    const detector = BarcodeDetectorCtor
      ? new BarcodeDetectorCtor({ formats: ['qr_code'] })
      : null;

    const stopStream = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
    };

    const startCamera = async () => {
      setCameraError(null);
      setStartingCamera(true);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStartingCamera(false);
        setCameraError('Camera access is not supported on this browser or connection.');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!active) {
          stopStream();
          return;
        }

        const videoEl = videoRef.current;
        if (videoEl) {
          videoEl.srcObject = stream;
          await videoEl.play().catch(() => {});
        }
        setStartingCamera(false);

        if (detector && videoEl) {
          let lastCheck = 0;
          const scanTick = async (now: number) => {
            if (!active) return;
            if (now - lastCheck > 220 && videoEl.readyState >= 2) {
              lastCheck = now;
              try {
                const codes = await detector.detect(videoEl);
                if (codes && codes.length > 0 && codes[0]?.rawValue) {
                  const val = String(codes[0].rawValue).trim();
                  if (val) {
                    stopStream();
                    onDetected(val);
                    return;
                  }
                }
              } catch {
                // Ignore transient frame detection errors
              }
            }
            rafId = requestAnimationFrame(scanTick);
          };
          rafId = requestAnimationFrame(scanTick);
        }
      } catch {
        if (!active) return;
        setStartingCamera(false);
        setCameraError('Unable to access camera. Please allow camera permission or upload a QR image below.');
      }
    };

    startCamera();

    return () => {
      active = false;
      stopStream();
    };
  }, [open, facingMode, onDetected]);

  if (!open) return null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      toast.error('QR image detection is not supported in this browser. Please use your phone camera app.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      const codes = await detector.detect(bitmap);
      if (codes && codes.length > 0 && codes[0]?.rawValue) {
        onDetected(String(codes[0].rawValue).trim());
      } else {
        toast.error('No QR code found in the selected image.');
      }
    } catch {
      toast.error('Could not read QR image.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualInput.trim();
    if (!trimmed) return;
    onDetected(trimmed);
  };

  return createPortal(
    <div className="shop-map-qr-backdrop" onClick={onClose}>
      <div className="shop-map-qr-modal qr-scanner-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shop-map-qr-header">
          <div>
            <h3>
              <Camera size={18} /> Scan Floor QR Code
            </h3>
            <p>Point your device camera at a floor or route QR code</p>
          </div>
          <button type="button" className="shop-map-qr-close" onClick={onClose} aria-label="Close QR Scanner">
            <X size={18} />
          </button>
        </div>

        <div className="shop-map-qr-body qr-scanner-body">
          <div className="qr-scanner-viewport">
            {cameraError ? (
              <div className="qr-scanner-fallback">
                <AlertCircle size={28} />
                <p>{cameraError}</p>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  className="qr-scanner-video"
                  playsInline
                  muted
                  autoPlay
                />
                <div className="qr-scanner-frame" aria-hidden="true">
                  <span className="qr-corner tl" />
                  <span className="qr-corner tr" />
                  <span className="qr-corner bl" />
                  <span className="qr-corner br" />
                  <span className="qr-scanner-laser" />
                </div>
                {startingCamera && (
                  <div className="qr-scanner-starting">Starting camera…</div>
                )}
              </>
            )}
          </div>

          <div className="qr-scanner-controls">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
            >
              <RefreshCw size={13} /> Flip Camera
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleImageUpload}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={13} /> Scan from Photo
            </button>
          </div>

          <form className="qr-scanner-manual" onSubmit={handleManualSubmit}>
            <input
              type="text"
              placeholder="Or paste QR link here…"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!manualInput.trim()}>
              <QrCode size={13} /> Open
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
