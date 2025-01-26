import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as LocAR from 'locar';

type PermissionState = 'idle' | 'granted' | 'denied';

const LocationPrompt: React.FC = () => {
  const [permission, setPermission] = useState<PermissionState>('idle');

  function requestCameraPermission(): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('[Camera] getUserMedia not supported'));
    }
    return navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .catch((envErr) => {
        console.warn('[Camera] environment error:', envErr);
        return navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      });
  }

  const handleStartAR = () => {
    console.log('[AR] Starting permission chain...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log('[Location] granted!', pos);
        requestCameraPermission()
          .then((stream) => {
            console.log('[Camera] granted!', stream);
            setPermission('granted');
          })
          .catch((err) => {
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
  const userCoordRef = useRef<{ lat: number; lon: number; alt?: number } | null>(null);
  const objectCoordRef = useRef<{ lat: number; lon: number; alt?: number } | null>(null);
  const boxRef = useRef<THREE.Mesh | null>(null);
  let stableStartTime = 0;
  let isObjectPlaced = false;
  const STABLE_DURATION_MS = 3000;
  const ACCURACY_THRESHOLD = 10;
  const DIST_THRESHOLD = 1;

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.001, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    if (containerRef.current) {
      containerRef.current.appendChild(renderer.domElement);
    }

    const locar = new LocAR.LocationBased(scene, camera);
    const deviceControls = new LocAR.DeviceOrientationControls(camera);
    const cam = new LocAR.WebcamRenderer(renderer);

    locar.on('gpsupdate', (pos: GeolocationPosition, distMoved: number) => {
      const { latitude, longitude, accuracy } = pos.coords;
      userCoordRef.current = { lat: latitude, lon: longitude, alt: 0 };

      if (!isObjectPlaced) {
        if (accuracy <= ACCURACY_THRESHOLD && distMoved <= DIST_THRESHOLD) {
          if (stableStartTime === 0) {
            stableStartTime = Date.now();
          } else if (Date.now() - stableStartTime >= STABLE_DURATION_MS) {
            objectCoordRef.current = { lat: latitude, lon: longitude };
            boxRef.current = placeRedBox(locar, longitude, latitude);
            isObjectPlaced = true;
          }
        } else {
          stableStartTime = 0;
        }
      } else {
        if (boxRef.current && objectCoordRef.current) {
          const deltaLon = (longitude - objectCoordRef.current.lon) * 111320;
          const deltaLat = (latitude - objectCoordRef.current.lat) * 110574;
          boxRef.current.position.set(deltaLon, deltaLat, 0);
        }
      }
    });

    locar.startGps();

    const animate = () => {
      cam.update();
      deviceControls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      locar.stopGps();
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,0.7)', color: '#000', padding: '8px', borderRadius: '4px', zIndex: 20, fontSize: '14px' }}>
        <div><strong>내 위치:</strong> {userCoordRef.current ? `${userCoordRef.current.lat.toFixed(6)}, ${userCoordRef.current.lon.toFixed(6)}` : '---, ---'}</div>
        <div><strong>오브젝트 위치:</strong> {objectCoordRef.current ? `${objectCoordRef.current.lat.toFixed(6)}, ${objectCoordRef.current.lon.toFixed(6)}` : '---, ---'}</div>
      </div>
    </div>
  );
};

function placeRedBox(locar: any, lon: number, lat: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(geo, mat);
  locar.add(mesh, lon, lat, 0);
  return mesh;
}
