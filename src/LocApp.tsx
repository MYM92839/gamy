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
        requestCameraPermission().then(() => {
          setPermission('granted');
        }).catch(() => {
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
      <p>방향 센서 / 위치 / 카메라 권한을 얻어야 AR을 시작할 수 있습니다.</p>
      <button onClick={handleStartAR}>AR 시작하기</button>
    </div>
  );
};

export default LocationPrompt;

const LocApp: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [userCoord, setUserCoord] = useState<{ lat: number; lon: number; alt?: number } | null>(null);
  const [objectCoord, setObjectCoord] = useState<{ lat: number; lon: number; alt?: number } | null>(null);
  const boxRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.001, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    if (containerRef.current) {
      containerRef.current.appendChild(renderer.domElement);
    }

    const locar = new LocAR.LocationBased(scene, camera);
    const camRenderer = new LocAR.WebcamRenderer(renderer);
    const deviceControls = new LocAR.DeviceOrientationControls(camera);

    locar.on('gpsupdate', (pos: any) => {
      const { latitude, longitude } = pos.coords;
      setUserCoord({ lat: latitude, lon: longitude });

      if (!objectCoord) {
        setObjectCoord({ lat: latitude, lon: longitude });
        boxRef.current = placeRedBox(locar, longitude, latitude);
      } else if (boxRef.current) {
        const deltaLon = (longitude - objectCoord.lon) * 111320;
        const deltaLat = (latitude - objectCoord.lat) * 110574;
        boxRef.current.position.set(deltaLon, deltaLat, 0);
      }
    });

    locar.startGps();

    const animate = () => {
      camRenderer.update();
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
  }, [objectCoord]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,0.7)', padding: '8px', borderRadius: '4px', zIndex: 20, fontSize: '14px' }}>
        <div>
          <strong>내 위치:</strong> {userCoord ? `${userCoord.lat.toFixed(6)}, ${userCoord.lon.toFixed(6)}` : '---, ---'}
        </div>
        <div>
          <strong>오브젝트 위치:</strong> {objectCoord ? `${objectCoord.lat.toFixed(6)}, ${objectCoord.lon.toFixed(6)}` : '---, ---'}
        </div>
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
