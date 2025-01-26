import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as LocAR from 'locar';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';
import * as tf from '@tensorflow/tfjs';

type PermissionState = 'idle' | 'granted' | 'denied';

const LocationPrompt: React.FC = () => {
  const [permission, setPermission] = useState<PermissionState>('idle');

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
    <div className="text-center mt-12">
      <h2 className="text-xl font-bold">AR 권한 요청</h2>
      <button className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg shadow-md" onClick={handleStartAR}>
        AR 시작하기
      </button>
    </div>
  );
};

export default LocationPrompt;

type AppState = 'idle' | 'calibrating' | 'stabilized' | 'viewing';

const ARApp: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<AppState>('idle');
  const userCoordRef = useRef<{ lat: number; lon: number } | null>(null);
  const correctedCoordRef = useRef<{ lat: number; lon: number } | null>(null);
  const boxRef = useRef<THREE.Mesh | null>(null);
  const DIST_THRESHOLD = useRef(0.0001);
  const STABLE_DURATION_MS = 3000;
  const ACCURACY_THRESHOLD = 10;
  const stableStartTimeRef = useRef(0);

  const markerCoord = { lat: 37.3411707, lon: 127.0649522 };

  useEffect(() => {
    const initAR = async () => {
      await tf.setBackend('webgl');
      await tf.ready();
      console.log('TensorFlow.js backend initialized.');

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.001, 1000);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      containerRef.current?.appendChild(renderer.domElement);

      const mindarThree = new MindARThree({
        container: containerRef.current!,
        imageTargetSrc: 'https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/card-example/card.mind',
      });

      const mindarAnchor = mindarThree.addAnchor(0);

      mindarAnchor.onTargetFound = () => {
        console.log('Marker found! Calibrating GPS...');
        setState('calibrating');
        stableStartTimeRef.current = Date.now();

        if (userCoordRef.current) {
          const latOffset = markerCoord.lat - userCoordRef.current.lat;
          const lonOffset = markerCoord.lon - userCoordRef.current.lon;

          correctedCoordRef.current = {
            lat: userCoordRef.current.lat + latOffset,
            lon: userCoordRef.current.lon + lonOffset,
          };

          console.log(`GPS corrected to: ${correctedCoordRef.current.lat}, ${correctedCoordRef.current.lon}`);
          setState('stabilized');

          const cube = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
          );
          cube.position.set(0, 0, -5);
          mindarAnchor.group.add(cube);
          boxRef.current = cube;
          console.log('Cube added to scene');
        }
      };

      await mindarThree.start();
      console.log('MindAR started successfully');

      const locar = new LocAR.LocationBased(scene, camera);
      locar.startGps();

      locar.on('gpsupdate', (pos: GeolocationPosition) => {
        const { latitude, longitude, accuracy } = pos.coords;
        userCoordRef.current = { lat: latitude, lon: longitude };

        if (accuracy <= ACCURACY_THRESHOLD) {
          if (state === 'calibrating' && Date.now() - stableStartTimeRef.current >= STABLE_DURATION_MS) {
            setState('stabilized');
          }
        } else {
          stableStartTimeRef.current = Date.now();
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
        mindarThree.stop();
        locar.stopGps();
        renderer.dispose();
        scene.clear();
      };
    };

    initAR().catch(console.error);
  }, [state]);

  return (
    <div ref={containerRef} className="w-full h-screen relative bg-black">
      <h2 className="absolute top-5 left-5 text-lg font-bold text-white bg-gray-800 p-2 rounded">
        MindAR + LocAR 연동 테스트
      </h2>
      <p className="absolute top-14 left-5 text-sm text-gray-300">
        현재 상태: {state}
      </p>
    </div>
  );
};
