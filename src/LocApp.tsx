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

    // 1) 자이로 권한
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
      // 2) 위치 권한
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
      // 3) 카메라 권한
      .then(() => {
        return requestCameraPermission();
      })
      // 모두 성공
      .then((stream) => {
        console.log('[Camera] granted!', stream);
        setPermission('granted');
      })
      // 하나라도 실패
      .catch((err) => {
        console.error('[AR chain] permission error:', err);
        setPermission('denied');
      });
  };

  // 권한 OK → LocApp
  if (permission === 'granted') {
    return <LocApp />;
  }

  // 권한 거부
  if (permission === 'denied') {
    return (
      <div style={{ textAlign: 'center', marginTop: 50 }}>
        <h3>권한이 거부되었습니다.</h3>
        <p>위치 / 자이로 / 카메라 권한이 모두 허용되어야 AR을 사용할 수 있습니다.</p>
        <p>브라우저나 OS 설정에서 권한을 다시 허용한 뒤 페이지를 새로고침 해 주세요.</p>
      </div>
    );
  }

  // 대기(초기)
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

  // 보정중 여부
  const [isStabilizing, setIsStabilizing] = useState(true);

  // 사용자 GPS 좌표 (수시로 업데이트)
  const [userCoord, setUserCoord] = useState<{ lat: number; lon: number } | null>(null);

  // 오브젝트 최종 배치 좌표 (고정)
  const [objectCoord, setObjectCoord] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    let animationId = 0;

    // ============== 1) Three.js 초기화 ==============
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      80,
      window.innerWidth / window.innerHeight,
      0.001,
      1000
    );
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

    // ============== 2) LocAR 인스턴스 ==============
    const locar = new LocAR.LocationBased(scene, camera);
    const deviceControls = new LocAR.DeviceOrientationControls(camera);
    const cam = new LocAR.WebcamRenderer(renderer);

    // ============== 3) GPS 안정화 로직 ==============
    let isObjectPlaced = false;
    let stableStartTime = 0;

    // 예: Wi-Fi 있는지 여부
    let wifiAvailable = true;
    const ACCURACY_THRESHOLD = 20;
    const DIST_THRESHOLD = 2;
    const STABLE_DURATION_MS = wifiAvailable ? 3000 : 5000;

    locar.on('gpsupdate', (pos: GeolocationPosition, distMoved: number) => {
      if (isObjectPlaced) return;

      const { latitude, longitude, accuracy } = pos.coords;
      // userCoord에 현재 위치 저장
      setUserCoord({ lat: latitude, lon: longitude });

      console.log(
        `GPS update -> lat:${latitude}, lon:${longitude}, acc:${accuracy}, dist:${distMoved}`
      );

      const isAccurateEnough = accuracy <= ACCURACY_THRESHOLD;
      const isMovedSmall = distMoved <= DIST_THRESHOLD;

      if (isAccurateEnough && isMovedSmall) {
        // 안정 후보
        if (stableStartTime === 0) {
          stableStartTime = Date.now();
        } else {
          const stableElapsed = Date.now() - stableStartTime;
          if (stableElapsed >= STABLE_DURATION_MS) {
            // 안정 확정
            placeRedBox(locar, longitude, latitude);
            isObjectPlaced = true;
            setObjectCoord({ lat: latitude, lon: longitude }); // 오브젝트 좌표 기록
            setIsStabilizing(false); // 보정 완료
          }
        }
      } else {
        // 불안정 -> 리셋
        stableStartTime = 0;
      }
    });

    // ============== 4) GPS 시작 ==============
    locar.startGps();

    // ============== 5) 애니메이션 루프 ==============
    const animate = () => {
      cam.update();
      deviceControls.update();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    // ============== Cleanup ==============
    return () => {
      window.removeEventListener('resize', onResize);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
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

      {/* 좌표 정보 표시 (왼쪽 상단에 고정) */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background: 'rgba(255,255,255,0.7)',
          color: '#000',
          padding: '8px',
          borderRadius: '4px',
          zIndex: 20,
          fontSize: '14px',
        }}
      >
        <div>
          <strong>내 위치:</strong>{' '}
          {userCoord
            ? `${userCoord.lat.toFixed(6)}, ${userCoord.lon.toFixed(6)}`
            : '---, ---'}
        </div>
        <div>
          <strong>오브젝트 위치:</strong>{' '}
          {objectCoord
            ? `${objectCoord.lat.toFixed(6)}, ${objectCoord.lon.toFixed(6)}`
            : '---, ---'}
        </div>
      </div>
    </div>
  );
};

function placeRedBox(locar: any, lon: number, lat: number) {
  console.log(`placeRedBox at lon:${lon}, lat:${lat}`);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(geo, mat);
  // locar.add(mesh, 경도, 위도, 고도, {props})
  locar.add(mesh, lon, lat, 0, { name: 'Red Box' });
}


// export default LocApp;


// export default LocApp