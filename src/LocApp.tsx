import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as THREEx from './libs/threex.js';

const LocationPrompt: React.FC = () => {
  const [permission, setPermission] = useState<'idle' | 'granted' | 'denied'>('idle');

  function requestCameraPermission(): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('[Camera] getUserMedia not supported'));
    }
    return navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      .catch((envErr) => {
        console.warn('[Camera] environment error:', envErr);
        return navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      });
  }

  const handleStartAR = () => {
    navigator.geolocation.getCurrentPosition(
      () => {
        requestCameraPermission()
          .then(() => setPermission('granted'))
          .catch(() => setPermission('denied'));
      },
      () => setPermission('denied'),
      { enableHighAccuracy: true }
    );
  };

  if (permission === 'granted') {
    return <ARApp />;
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-800 text-white">
      <h2 className="text-2xl font-bold">AR 권한 요청</h2>
      <button className="mt-4 px-6 py-3 bg-blue-500 rounded-lg shadow-lg" onClick={handleStartAR}>
        AR 시작하기
      </button>
    </div>
  );
};

export default LocationPrompt;

const ARApp: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'calibrating' | 'stabilized' | 'viewing'>('idle');
  const userCoordRef = useRef<{ lat: number; lon: number } | null>(null);
  const correctedCoordRef = useRef<{ lat: number; lon: number } | null>(null);
  const boxRef = useRef<THREE.Mesh | null>(null);
  const DIST_THRESHOLD = useRef(0.0001);
  const STABLE_DURATION_MS = 3000;
  const ACCURACY_THRESHOLD = 10;
  let stableStartTime = 0;

  const markerCoord = { lat: 37.3411707, lon: 127.0649522 };

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.001, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current?.appendChild(renderer.domElement);

    const arToolkitSource = new THREEx.ArToolkitSource({ sourceType: 'webcam' });
    const arToolkitContext = new THREEx.ArToolkitContext({ detectionMode: 'mono_and_matrix', canvasWidth: 640, canvasHeight: 480 });

    arToolkitSource.init(() => {
      setTimeout(() => arToolkitContext.init(() => {
        camera.projectionMatrix.copy(arToolkitContext.getProjectionMatrix());
      }), 1000);
    });

    new THREEx.ArMarkerControls(arToolkitContext, camera, {
      type: 'barcode',
      barcodeValue: 5,
      size: 1,
    });

    navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      userCoordRef.current = { lat: latitude, lon: longitude };

      if (accuracy <= ACCURACY_THRESHOLD) {
        if (state === 'calibrating' && Date.now() - stableStartTime >= STABLE_DURATION_MS) {
          setState('stabilized');
          correctedCoordRef.current = markerCoord;
        }
      } else {
        stableStartTime = Date.now();
      }

      if (state === 'stabilized' && correctedCoordRef.current) {
        const deltaLon = (longitude - correctedCoordRef.current.lon) * 111320;
        const deltaLat = (latitude - correctedCoordRef.current.lat) * 110574;
        const distance = Math.sqrt(deltaLon ** 2 + deltaLat ** 2);

        if (distance > DIST_THRESHOLD.current) {
          boxRef.current?.position.set(deltaLon, deltaLat, 0);
          DIST_THRESHOLD.current = 0.00001;
          setState('viewing');
        }
      }
    });

    const animate = () => {
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [state]);

  return (
    <div ref={containerRef} className="relative w-full h-screen bg-black">
      <div className="absolute top-5 left-5 text-lg font-bold text-white bg-gray-800 p-2 rounded">
        AR.js 위치 기반 AR 테스트
      </div>
      <p className="absolute top-14 left-5 text-sm text-gray-300">현재 상태: {state}</p>
    </div>
  );
};