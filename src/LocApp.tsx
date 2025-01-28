import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as LocAR from 'locar';
import KalmanFilter from 'kalmanjs';

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
              resolve();
            } else {
              reject(new Error('Orientation denied'));
            }
          })
          .catch((err: any) => reject(err));
      } else {
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
            () => resolve(),
            (err) => reject(err),
            { enableHighAccuracy: true }
          );
        });
      })
      .then(() => requestCameraPermission())
      .then(() => {
        setPermission('granted');
      })
      .catch(() => setPermission('denied'));
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
  const [userCoord, setUserCoord] = useState<{ lat: number; lon: number; alt?: number } | null>(
    null
  );

  const fixedObjectCoord = { lat: 37.341186, lon: 127.064875, alt: 0 }; // 정해진 오브젝트 위치

  useEffect(() => {
    let animationId = 0;

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

    const locar = new LocAR.LocationBased(scene, camera);
    const deviceControls = new LocAR.DeviceOrientationControls(camera);
    const cam = new LocAR.WebcamRenderer(renderer);

    const kalmanLat = new KalmanFilter();
    const kalmanLon = new KalmanFilter();

    locar.startGps();

    let isObjectPlaced = false;
    let stableStartTime = 0;
    const ACCURACY_THRESHOLD = 10;
    const DIST_THRESHOLD = 1;
    const STABLE_DURATION_MS = 3000;

    // 유저 초기 위치를 오브젝트 위치와 동일하다고 가정
    const initialUserCoord = { ...fixedObjectCoord };
    setUserCoord(initialUserCoord);

    // 오프셋 저장용 변수
    let offset = { lat: 0, lon: 0, alt: 0 };

    locar.on('gpsupdate', (pos: GeolocationPosition, distMoved: number) => {
      const { latitude, longitude, accuracy } = pos.coords;

      // 칼만 필터를 적용하여 위치 데이터를 부드럽게 처리
      const smoothedLat = kalmanLat.filter(latitude);
      const smoothedLon = kalmanLon.filter(longitude);
      setUserCoord({ lat: smoothedLat, lon: smoothedLon });

      if (isObjectPlaced) {
        // 유저 이동 시 오프셋을 기준으로 오브젝트 위치 갱신
        const correctedCoords = locar.latLonToWorld(
          fixedObjectCoord.lat + offset.lat,
          fixedObjectCoord.lon + offset.lon,
          fixedObjectCoord.alt + offset.alt
        );
        locar.updateObjectLocation('1m² Box', correctedCoords.x, correctedCoords.y, correctedCoords.z);
        return;
      }

      const isAccurateEnough = accuracy <= ACCURACY_THRESHOLD;
      const isMovedSmall = distMoved <= DIST_THRESHOLD;

      if (isAccurateEnough && isMovedSmall) {
        if (stableStartTime === 0) {
          stableStartTime = Date.now();
        } else {
          const stableElapsed = Date.now() - stableStartTime;
          if (stableElapsed >= STABLE_DURATION_MS) {
            // 오프셋 계산 및 저장
            offset = {
              lat: smoothedLat - fixedObjectCoord.lat,
              lon: smoothedLon - fixedObjectCoord.lon,
              alt: 0, // 고도가 다를 경우 추가 처리 가능
            };

            // 오브젝트를 고정된 위치에 배치
            placeRedBox(locar, fixedObjectCoord.lon, fixedObjectCoord.lat, fixedObjectCoord.alt);
            isObjectPlaced = true;
            setIsStabilizing(false);
          }
        }
      } else {
        stableStartTime = 0;
      }
    });

    const animate = () => {
      cam.update();
      deviceControls.update();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

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
          {`${fixedObjectCoord.lat.toFixed(6)}, ${fixedObjectCoord.lon.toFixed(6)}`}
        </div>
      </div>
    </div>
  );
};

function placeRedBox(locar: any, lon: number, lat: number, alt: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(geo, mat);
  locar.add(mesh, lon, lat, alt);
  return mesh;
}
