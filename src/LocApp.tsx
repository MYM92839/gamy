import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as LocAR from 'locar';

type PermissionState = 'idle' | 'granted' | 'denied';

const LocationPrompt: React.FC = () => {
  const [permission, setPermission] = useState<PermissionState>('idle');

  // 카메라 권한 요청
  async function requestCameraPermission(): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('[Camera] getUserMedia not supported');
    }
    return navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  }

  // AR 시작하기 버튼 핸들러
  const handleStartAR = async () => {
    console.log('[AR] Starting permission chain...');

    try {
      // 자이로 (DeviceOrientationEvent)
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof (DeviceOrientationEvent as any).requestPermission === 'function'
      ) {
        const res = await (DeviceOrientationEvent as any).requestPermission();
        if (res !== 'granted') {
          throw new Error('Orientation denied');
        }
      }

      // 위치 권한
      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(),
          (err) => reject(err),
          { enableHighAccuracy: true }
        );
      });

      // 카메라 권한
      await requestCameraPermission();

      // 모두 성공
      setPermission('granted');
    } catch (err) {
      console.error('[AR chain] permission error:', err);
      setPermission('denied');
    }
  };

  if (permission === 'granted') {
    return <LocApp />;
  }

  if (permission === 'denied') {
    return (
      <div style={{ textAlign: 'center', marginTop: 50 }}>
        <h3>권한이 거부되었습니다.</h3>
        <p>위치 / 자이로 / 카메라 권한이 모두 허용되어야 AR을 사용할 수 있습니다.</p>
        <p>브라우저/OS 설정에서 권한을 다시 허용한 뒤 페이지를 새로고침 해 주세요.</p>
      </div>
    );
  }

  // idle 상태
  return (
    <div style={{ textAlign: 'center', marginTop: 50 }}>
      <h2>AR 권한 요청</h2>
      <p>방향 센서 / 위치 / 카메라 권한을 얻어야 AR을 시작할 수 있습니다.</p>
      <button onClick={handleStartAR}>AR 시작하기</button>
    </div>
  );
};

export default LocationPrompt;

interface ObjectCoord {
  id: string;
  lat: number;
  lon: number;
}

const LocApp: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  const [isStabilizing, setIsStabilizing] = useState(true);
  const [userCoord, setUserCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [objectCoord, setObjectCoord] = useState<ObjectCoord | null>(null);

  const isObjectPlacedRef = useRef(false);
  const stableStartTimeRef = useRef(0);
  const DIST_THRESHOLD_REF = useRef(1);

  useEffect(() => {
    // Three.js + LocAR 초기화
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.001, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    if (containerRef.current) {
      containerRef.current.appendChild(renderer.domElement);
    }

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    const locar = new LocAR.LocationBased(scene, camera);
    const deviceControls = new LocAR.DeviceOrientationControls(camera);
    const cam = new LocAR.WebcamRenderer(renderer);

    const ACCURACY_THRESHOLD = 10;
    const STABLE_DURATION_MS = 3000;

    locar.on('gpsupdate', (pos: GeolocationPosition, distMoved: number) => {
      const { latitude, longitude, accuracy } = pos.coords;
      setUserCoord({ lat: latitude, lon: longitude });

      console.log(`User Position: (${latitude}, ${longitude}), Distance Moved: ${distMoved}`);

      if (isObjectPlacedRef.current && objectCoord) {
        const latDiff = latitude - objectCoord.lat;
        const lonDiff = longitude - objectCoord.lon;

        const metersPerLatDeg = 111320;
        const cosLat = Math.cos((latitude * Math.PI) / 180);
        const metersPerLonDeg = 111320 * cosLat;

        const latDiffM = latDiff * metersPerLatDeg;
        const lonDiffM = lonDiff * metersPerLonDeg;

        console.log(`Lat Diff (m): ${latDiffM}, Lon Diff (m): ${lonDiffM}`);

        const relativeX = lonDiffM;
        const relativeZ = -latDiffM;

        console.log(`Updating Object Position to: X=${relativeX}, Z=${relativeZ}`);

        locar.updateObjectPosition(objectCoord.id, relativeX, relativeZ, 0);

        return;
      }

      if (accuracy <= ACCURACY_THRESHOLD && distMoved <= DIST_THRESHOLD_REF.current) {
        if (stableStartTimeRef.current === 0) {
          stableStartTimeRef.current = Date.now();
          console.log('Stabilization started');
        } else {
          const stableElapsed = Date.now() - stableStartTimeRef.current;
          console.log(`Stabilization elapsed: ${stableElapsed}ms`);

          if (stableElapsed >= STABLE_DURATION_MS) {
            const objId = placeRedBox(locar, longitude, latitude);
            setObjectCoord({ id: objId, lat: latitude, lon: longitude });
            isObjectPlacedRef.current = true;
            setIsStabilizing(false);

            DIST_THRESHOLD_REF.current = 0;
            console.log('Object placed and stabilization completed');
          }
        }
      } else {
        stableStartTimeRef.current = 0;
        console.log('Stabilization reset');
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
      window.removeEventListener('resize', onResize);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [objectCoord]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {isStabilizing && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: '8px',
            zIndex: 10,
          }}
        >
          보정 중입니다...
        </div>
      )}

      {/* 디버그 정보 */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background: 'rgba(255,255,255,0.7)',
          padding: '8px',
          borderRadius: '4px',
          zIndex: 20,
        }}
      >
        <div>
          유저 위치:{' '}
          {userCoord
            ? `(${userCoord.lat.toFixed(6)}, ${userCoord.lon.toFixed(6)})`
            : '---'}
        </div>
        <div>
          오브젝트 위치:{' '}
          {objectCoord
            ? `(${objectCoord.lat.toFixed(6)}, ${objectCoord.lon.toFixed(6)})`
            : '---'}
        </div>
      </div>
    </div>
  );
};

// -------------------------------
// 오브젝트 배치 함수
function placeRedBox(locar: any, lon: number, lat: number): string {
  const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  const mesh = new THREE.Mesh(geo, mat);

  const objId = Math.random().toString(36).substr(2, 9);

  // 고도는 alt-1
  locar.add(mesh, lon, lat, - 1, {
    name: '1m² Box',
    id: objId,
  });

  return objId;
}