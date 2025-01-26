import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as LocAR from 'locar';
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js';

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
          .then(() => {
            setPermission('granted');
          })
          .catch(() => {
            setPermission('denied');
          });
      },
      () => {
        setPermission('denied');
      },
      { enableHighAccuracy: true }
    );
  };

  if (permission === 'granted') {
    return <ARApp />;
  }

  return (
    <div style={{ textAlign: 'center', marginTop: 50 }}>
      <h2>AR 권한 요청</h2>
      <button onClick={handleStartAR}>AR 시작하기</button>
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
  const animationFrameRef = useRef<number | null>(null);

  const markerCoord = { lat: 37.3411707, lon: 127.0649522 };

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.001, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current?.appendChild(renderer.domElement);

    const mindarThree = new MindARThree({
      container: containerRef.current,
      imageTargetSrc: "/card.mind"
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

    mindarThree.start();

    const locar = new LocAR.LocationBased(scene, camera);
    locar.startGps();

    locar.on('gpsupdate', (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      userCoordRef.current = { lat: latitude, lon: longitude };

      console.log(`[GPS] Lat: ${latitude}, Lon: ${longitude}, Accuracy: ${accuracy}`);

      if (accuracy <= ACCURACY_THRESHOLD) {
        if (state === 'calibrating' && Date.now() - stableStartTimeRef.current >= STABLE_DURATION_MS) {
          setState('stabilized');
        }
      } else {
        stableStartTimeRef.current = Date.now();
      }

      if (state === 'stabilized') {
        const deltaLon = (longitude - correctedCoordRef.current!.lon) * 111320;
        const deltaLat = (latitude - correctedCoordRef.current!.lat) * 110574;
        const distance = Math.sqrt(deltaLon ** 2 + deltaLat ** 2);

        if (distance > DIST_THRESHOLD.current) {
          boxRef.current?.position.set(deltaLon, deltaLat, 0);
          DIST_THRESHOLD.current = 0.00001;
          setState('viewing');
        }
      }

      if (state === 'viewing' && correctedCoordRef.current) {
        const distanceToUser = getDistanceFromLatLonInMeters(
          latitude,
          longitude,
          correctedCoordRef.current.lat,
          correctedCoordRef.current.lon
        );
        const scaleFactor = Math.max(0.1, 5 / distanceToUser);
        boxRef.current?.scale.set(scaleFactor, scaleFactor, scaleFactor);
      }
    });

    const animate = () => {
      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      mindarThree.stop();
      locar.stopGps();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [state]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <h2>MindAR + LocAR 연동 테스트</h2>
      <p>현재 상태: {state}</p>
      {state === 'calibrating' && <p>보정 중입니다...</p>}
      {state === 'stabilized' && <p>위치가 보정되었습니다.</p>}
      {state === 'viewing' && <p>오브젝트를 관찰 중입니다.</p>}
    </div>
  );
};

function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
