import * as LocAR from 'locar';
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

type PermissionState = 'idle' | 'granted' | 'denied';

const LocationPrompt: React.FC = () => {
  const [permission, setPermission] = useState<PermissionState>('idle');

  const handleStartAR = () => {
    console.log('[AR] Starting permission chain...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log('[Location] granted!', pos);
        requestCameraPermission().then((stream) => {
          console.log('[Camera] granted!', stream);
          setPermission('granted');
        }).catch((err) => {
          console.error('[Camera] permission error:', err);
          setPermission('denied');
        });
      },
      (err) => {
        console.error('[Location] permission error:', err);
        setPermission('denied');
      },
      { enableHighAccuracy: true }
    );
  };

  if (permission === 'granted') {
    return <LocApp />;
  }

  return (
    <div style={{ textAlign: 'center', marginTop: 50 }}>
      <h2>AR 권한 요청</h2>
      <button onClick={handleStartAR}>AR 시작하기</button>
    </div>
  );
};

export default LocationPrompt;

const LocApp: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const locarRef = useRef<any | null>(null);
  const placedObjectRef = useRef<THREE.Mesh | null>(null);
  const baseCoordRef = useRef<{ lat: number; lon: number } | null>(null);
  const [userCoord, setUserCoord] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    if (containerRef.current) {
      containerRef.current.appendChild(renderer.domElement);
    }

    const locar = new LocAR.LocationBased(scene, camera);
    locarRef.current = locar;

    locar.on('gpsupdate', (pos: any) => {
      const { latitude, longitude } = pos.coords;
      setUserCoord({ lat: latitude, lon: longitude });

      if (!baseCoordRef.current) {
        baseCoordRef.current = { lat: latitude, lon: longitude };
        placedObjectRef.current = placeRedBox(locar, 0, 0);
      }

      if (placedObjectRef.current && baseCoordRef.current) {
        const distance = getDistanceFromLatLonInMeters(
          latitude,
          longitude,
          baseCoordRef.current.lat,
          baseCoordRef.current.lon
        );

        const scaleFactor = Math.max(0.1, 5 / distance);
        placedObjectRef.current.scale.set(scaleFactor, scaleFactor, scaleFactor);
      }
    });

    locar.startGps();

    const animate = () => {
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      locar.stopGps();
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background: 'rgba(255,255,255,0.7)',
          padding: '10px',
          borderRadius: '5px',
        }}
      >
        <p><strong>내 위치:</strong> {userCoord ? `${userCoord.lat.toFixed(6)}, ${userCoord.lon.toFixed(6)}` : '---, ---'}</p>
      </div>
    </div>
  );
};

function placeRedBox(locar: any, x: number, y: number) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, 0);
  locar.add(mesh);
  return mesh;
}

function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function requestCameraPermission(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  });
}
