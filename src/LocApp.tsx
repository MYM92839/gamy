import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as LocAR from 'locar';
import { ArToolkitSource, ArToolkitContext, ArMarkerControls } from 'threex';

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

    const orientationPromise = new Promise<void>((resolve, reject) => {
      const hasOrientationEvent = typeof DeviceOrientationEvent !== 'undefined';
      const needsRequest =
        hasOrientationEvent &&
        typeof (DeviceOrientationEvent as any).requestPermission === 'function';

      if (needsRequest) {
        (DeviceOrientationEvent as any)
          .requestPermission()
          .then((res: string) => {
            if (res === 'granted') {
              console.log('[Orientation] granted');
              resolve();
            } else {
              reject(new Error('Orientation denied'));
            }
          })
          .catch((err: any) => {
            reject(err);
          });
      } else {
        console.log('[Orientation] no permission needed');
        resolve();
      }
    });

    orientationPromise
      .then(() => {
        return new Promise<void>((resolve, reject) => {
          if (!('geolocation' in navigator)) {
            return reject(new Error('Geolocation not supported'));
          }
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              console.log('[Location] granted!', pos);
              resolve();
            },
            (err) => {
              reject(err);
            },
            { enableHighAccuracy: true }
          );
        });
      })
      .then(() => {
        return requestCameraPermission();
      })
      .then((stream) => {
        console.log('[Camera] granted!', stream);
        setPermission('granted');
      })
      .catch((err) => {
        console.error('[AR chain] permission error:', err);
        setPermission('denied');
      });
  };

  if (permission === 'granted') {
    return <LocApp />;
  }

  if (permission === 'denied') {
    return (
      <div style={{ textAlign: 'center', marginTop: 50 }}>
        <h3>권한이 거부되었습니다.</h3>
        <p>위치 / 자이로 / 카메라 권한이 모두 허용되어야 AR을 사용할 수 있습니다.</p>
        <p>브라우저나 OS 설정에서 권한을 다시 허용한 뒤 페이지를 새로고침 해 주세요.</p>
      </div>
    );
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
  const [isStabilizing, setIsStabilizing] = useState(true);
  const [userCoord, setUserCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [objectCoord, setObjectCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [isMarkerDetected, setIsMarkerDetected] = useState(false);

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      80,
      window.innerWidth / window.innerHeight,
      0.001,
      1000
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current?.appendChild(renderer.domElement);

    // AR.js 마커 인식 초기화
    const arToolkitSource = new ArToolkitSource({ sourceType: 'webcam' });
    const arToolkitContext = new ArToolkitContext({
      detectionMode: 'mono_and_matrix',
      canvasWidth: 640,
      canvasHeight: 480,
    });

    arToolkitSource.init(() => {
      setTimeout(() => {
        arToolkitContext.init(() => {
          camera.projectionMatrix.copy(arToolkitContext.getProjectionMatrix());
        });
      }, 1000);
    });

    const markerControls = new ArMarkerControls(arToolkitContext, camera, {
      type: 'barcode',
      barcodeValue: 5, // QR 코드의 값
      size: 1,
    });

    scene.add(new THREE.AmbientLight(0xffffff));

    const locar = new LocAR.LocationBased(scene, camera);
    const deviceControls = new LocAR.DeviceOrientationControls(camera);
    const cam = new LocAR.WebcamRenderer(renderer);

    locar.on('gpsupdate', (pos: GeolocationPosition) => {
      if (isMarkerDetected) return;
      const { latitude, longitude } = pos.coords;
      setUserCoord({ lat: latitude, lon: longitude });
    });

    markerControls.addEventListener('markerFound', () => {
      console.log('[Marker] Detected!');
      setIsMarkerDetected(true);
      placeRedBox(locar, 127.0649522, 37.3411707); // 마커의 고정된 좌표
    });

    const animate = () => {
      if (arToolkitSource.ready) {
        arToolkitContext.update(arToolkitSource.domElement);
      }
      cam.update();
      deviceControls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-screen bg-black">
      {isStabilizing && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-800 text-white p-4 rounded-lg">
          보정 중입니다...
        </div>
      )}
      <div className="absolute top-5 left-5 bg-white text-black p-2 rounded">
        <p>
          <strong>내 위치:</strong>{' '}
          {userCoord ? `${userCoord.lat}, ${userCoord.lon}` : '---, ---'}
        </p>
        <p>
          <strong>마커 상태:</strong> {isMarkerDetected ? '인식됨' : '대기 중'}
        </p>
      </div>
    </div>
  );
};

function placeRedBox(locar: any, lon: number, lat: number): THREE.Mesh {
  console.log(`placeRedBox at lon=${lon}, lat=${lat}`);
  const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  const mesh = new THREE.Mesh(geo, mat);
  locar.add(mesh, lon, lat, 0, { name: 'QR Marker Box' });
  return mesh;
}