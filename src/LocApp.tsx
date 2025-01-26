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
  const [, setUpdateUI] = useState(false);
  const [isStabilizing, setIsStabilizing] = useState(true);
  const userCoordRef = useRef<{ lat: number; lon: number; alt: number } | null>(null);
  const objectCoordRef = useRef<{ lat: number; lon: number; alt: number } | null>(null);
  const boxRef = useRef<THREE.Mesh | null>(null);
  let stableStartTime = 0;
  let isObjectPlaced = false;
  const STABLE_DURATION_MS = 3000;
  const ACCURACY_THRESHOLD = 10;
  let DIST_THRESHOLD = 1;

  const smoothGpsData = (newCoord: { lat: number; lon: number; alt: number }) => {
    if (!userCoordRef.current) {
      userCoordRef.current = newCoord;
    } else {
      userCoordRef.current.lat = (userCoordRef.current.lat * 9 + newCoord.lat) / 10;
      userCoordRef.current.lon = (userCoordRef.current.lon * 9 + newCoord.lon) / 10;
      userCoordRef.current.alt = (userCoordRef.current.alt * 9 + newCoord.alt) / 10;
    }
  };

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

    locar.on('gpsupdate', (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      smoothGpsData({ lat: latitude, lon: longitude, alt: 0 });
      setUpdateUI((prev) => !prev);

      if (!isObjectPlaced) {
        if (accuracy <= ACCURACY_THRESHOLD) {
          if (stableStartTime === 0) {
            stableStartTime = Date.now();
          } else if (Date.now() - stableStartTime >= STABLE_DURATION_MS) {
            objectCoordRef.current = { lat: latitude, lon: longitude, alt: 0 };
            boxRef.current = placeRedBox(locar, longitude, latitude - (5 / 110574));
            isObjectPlaced = true;
            DIST_THRESHOLD = 0.00001;
            setIsStabilizing(false);
          }
        } else {
          stableStartTime = 0;
        }
      } else if (objectCoordRef.current) {
        const deltaLon = (longitude - objectCoordRef.current.lon) * 111320;
        const deltaLat = (latitude - objectCoordRef.current.lat) * 110574;
        const distance = Math.sqrt(deltaLon ** 2 + deltaLat ** 2);

        if (distance > DIST_THRESHOLD) {
          boxRef.current?.position.set(deltaLon, deltaLat, 0);
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
      {isStabilizing && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '10px 20px', borderRadius: '8px', zIndex: 10 }}>
          보정 중입니다...
        </div>
      )}
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