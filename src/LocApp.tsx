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
  const [logs, setLogs] = useState<string[]>([]); // 로그 상태 추가

  // useRef로 상태 관리
  const isObjectPlacedRef = useRef(false);
  const stableStartTimeRef = useRef(0);
  const DIST_THRESHOLD_REF = useRef(1); // 초기 1미터

  // 커스텀 로그 함수
  const log = (message: string) => {
    setLogs((prevLogs) => [...prevLogs, message]);
    console.log(message);
  };

  useEffect(() => {
    // Three.js + LocAR 초기화
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.001, 1000);
    camera.position.set(0, 0, 5); // 카메라를 z축 방향으로 이동
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    if (containerRef.current) {
      containerRef.current.appendChild(renderer.domElement);
    }

    // 좌표계 시각화
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    const gridHelper = new THREE.GridHelper(100, 100);
    scene.add(gridHelper);

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      log('Window resized and camera updated.');
    };
    window.addEventListener('resize', onResize);

    const locar = new LocAR.LocationBased(scene, camera);
    const deviceControls = new LocAR.DeviceOrientationControls(camera);
    const cam = new LocAR.WebcamRenderer(renderer);

    const ACCURACY_THRESHOLD = 10;
    const STABLE_DURATION_MS = 3000;

    const handleGpsUpdate = (pos: GeolocationPosition, distMoved: number) => {
      const { latitude, longitude, accuracy } = pos.coords;
      setUserCoord({ lat: latitude, lon: longitude });

      log(`User Position: (${latitude}, ${longitude}), Distance Moved: ${distMoved}m`);

      if (isObjectPlacedRef.current && objectCoord) {
        // LocAR이 좌표 변환을 처리한다고 가정
        // 위도와 경도를 직접 전달
        locar.updateObjectPosition(objectCoord.id, latitude, longitude, 0); // altitude는 필요 시 조정

        log(`Updated Object Position to: Latitude=${latitude}, Longitude=${longitude}`);
        return;
      }

      if (accuracy <= ACCURACY_THRESHOLD && distMoved <= DIST_THRESHOLD_REF.current) {
        if (stableStartTimeRef.current === 0) {
          stableStartTimeRef.current = Date.now();
          log('Stabilization started');
        } else {
          const stableElapsed = Date.now() - stableStartTimeRef.current;
          log(`Stabilization elapsed: ${stableElapsed}ms`);

          if (stableElapsed >= STABLE_DURATION_MS) {
            const objId = placeRedBox(locar, longitude, latitude, log);
            setObjectCoord({ id: objId, lat: latitude, lon: longitude });
            isObjectPlacedRef.current = true;
            setIsStabilizing(false);

            DIST_THRESHOLD_REF.current = 0;
            log('Object placed and stabilization completed');
          }
        }
      } else {
        stableStartTimeRef.current = 0;
        log('Stabilization reset');
      }
    };

    locar.on('gpsupdate', handleGpsUpdate);

    locar.startGps();

    const animate = () => {
      requestAnimationFrame(animate);
      cam.update();
      deviceControls.update();
      renderer.render(scene, camera);

      // 카메라의 현재 위치와 회전 값 로그 출력 (매 프레임마다 로그가 너무 많아질 수 있음)
      // 필요 시 주석 처리하거나 로그 빈도 조절
      log(`Camera Position: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
      log(`Camera Rotation: (${camera.rotation.x.toFixed(2)}, ${camera.rotation.y.toFixed(2)}, ${camera.rotation.z.toFixed(2)})`);
    };
    animate();

    return () => {
      window.removeEventListener('resize', onResize);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      locar.off('gpsupdate', handleGpsUpdate); // 이벤트 리스너 정리
    };
  }, []); // 의존성 배열을 빈 배열로 설정하여 초기화가 한 번만 실행되도록 함

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
          maxHeight: '40%',
          width: '80%',
          overflowY: 'auto',
          background: 'rgba(255,255,255,0.8)',
          padding: '8px',
          borderRadius: '4px',
          zIndex: 20,
          fontSize: '12px',
          lineHeight: '1.4',
        }}
      >
        <div>
          <strong>유저 위치:</strong>{' '}
          {userCoord
            ? `(${userCoord.lat.toFixed(6)}, ${userCoord.lon.toFixed(6)})`
            : '---'}
        </div>
        <div>
          <strong>오브젝트 위치:</strong>{' '}
          {objectCoord
            ? `(${objectCoord.lat.toFixed(6)}, ${objectCoord.lon.toFixed(6)})`
            : '---'}
        </div>
        <hr />
        <div>
          <strong>로그:</strong>
          <ul style={{ listStyleType: 'none', paddingLeft: '0' }}>
            {logs.map((logMsg, index) => (
              <li key={index} style={{ whiteSpace: 'pre-wrap' }}>
                {logMsg}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

// -------------------------------
// 오브젝트 배치 함수
function placeRedBox(locar: any, lon: number, lat: number, log: (msg: string) => void): string {
  const geo = new THREE.BoxGeometry(1, 1, 1); // 크기를 1로 설정
  const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  const mesh = new THREE.Mesh(geo, mat);

  const objId = Math.random().toString(36).substr(2, 9);

  // 고도를 0으로 설정 (필요 시 조정)
  locar.add(mesh, lon, lat, 0, {
    name: '1m³ Box',
    id: objId,
  });

  log(`Box placed with ID: ${objId} at (${lat}, ${lon})`);

  return objId;
}
