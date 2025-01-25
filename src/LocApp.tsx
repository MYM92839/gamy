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

// 최대 몇 개의 위치를 저장할지
const MAX_HISTORY = 5;

// meter 단위 거리 계산 (Haversine Formula)
function getDistanceM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6378137; // 지구 반지름 (m)
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // 미터
}

// 최근 N개의 위도경도 평균 계산
function computeAverage(positions: Array<{ lat: number; lon: number }>) {
  let sumLat = 0;
  let sumLon = 0;
  positions.forEach((pos) => {
    sumLat += pos.lat;
    sumLon += pos.lon;
  });
  return {
    lat: sumLat / positions.length,
    lon: sumLon / positions.length,
  };
}

/**
 * LocAR + Three.js AR 로직
 * - 최근 5개 좌표 슬라이딩 윈도우 -> 평균 -> 오차/변위가 작으면 안정
 */
const LocApp: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  // 보정중 여부
  const [isStabilizing, setIsStabilizing] = useState(true);

  // 사용자 GPS 좌표 (수시로 업데이트, '필터링 후'가 아니라 '실제 raw')
  const [userCoord, setUserCoord] = useState<{ lat: number; lon: number } | null>(null);

  // 오브젝트 최종 배치 좌표
  const [objectCoord, setObjectCoord] = useState<{ lat: number; lon: number } | null>(null);

  // 최근 n개 위치 저장 (raw)
  const positionsHistory = useRef<Array<{ lat: number; lon: number }>>([]);

  // 마지막 '평균 좌표'
  const [avgCoord, setAvgCoord] = useState<{ lat: number; lon: number } | null>(null);

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

    // ============== 3) GPS 안정화 + 이동평균 로직 ==============
    let isObjectPlaced = false;
    let stableStartTime = 0;

    // 조건들
    const ACCURACY_THRESHOLD = 20; // 20m 이하
    const MOVE_THRESHOLD = 1;      // 평균 좌표가 1m 이하로만 이동하면 안정
    const STABLE_DURATION_MS = 3000; // (Wi-Fi 고려 등, 여기선 3초 고정 예시)

    locar.on('gpsupdate', (pos: GeolocationPosition, distMoved: number) => {
      if (isObjectPlaced) return;

      const { latitude, longitude, accuracy } = pos.coords;
      // RAW 좌표를 표시
      setUserCoord({ lat: latitude, lon: longitude });

      // 오차가 너무 크면 굳이 history에 넣어봐야 노이즈가 크니, 그래도 넣긴 넣되
      // if (accuracy > 50) return; // 완전히 무시 가능. 여기서는 일단 넣자.

      // (1) 새 위치를 history에 추가
      positionsHistory.current.push({ lat: latitude, lon: longitude });
      // (2) 길이가 MAX_HISTORY 초과 시 가장 오래된 것 제거
      if (positionsHistory.current.length > MAX_HISTORY) {
        positionsHistory.current.shift();
      }

      // (3) 이동 평균(슬라이딩 윈도우) 계산
      const avg = computeAverage(positionsHistory.current);
      setAvgCoord(avg);

      console.log(
        `[GPS update] lat=${latitude.toFixed(6)}, lon=${longitude.toFixed(6)}, acc=${accuracy}, histLen=${positionsHistory.current.length}`
      );
      console.log(` -> Average: lat=${avg.lat.toFixed(6)}, lon=${avg.lon.toFixed(6)}`);

      // (4) 오차 / 평균 이동 체크
      // - accuracy <= ACCURACY_THRESHOLD
      // - 평균 좌표가 최근 업데이트에서 크게 변하지 않는지
      //   -> ex) 이전 avgCoord와의 거리 <= MOVE_THRESHOLD
      const isAccurate = accuracy <= ACCURACY_THRESHOLD;

      let isMovedSmall = false;
      if (avgCoord) {
        // 이전 평균(avgCoord)와 현재 avg의 거리
        const distAvg = getDistanceM(avgCoord.lat, avgCoord.lon, avg.lat, avg.lon);
        isMovedSmall = distAvg <= MOVE_THRESHOLD;
      } else {
        // 초기라 평균값이 없으면 바로 false
        isMovedSmall = false;
      }

      if (isAccurate && isMovedSmall) {
        if (stableStartTime === 0) {
          stableStartTime = Date.now();
        } else {
          const stableElapsed = Date.now() - stableStartTime;
          if (stableElapsed >= STABLE_DURATION_MS) {
            // ★ 안정 확정
            console.log('[Stable] Placing object at average coords');
            placeRedBox(locar, avg.lon, avg.lat);
            setObjectCoord({ lat: avg.lat, lon: avg.lon });
            setIsStabilizing(false);
            isObjectPlaced = true;
          }
        }
      } else {
        // 안정 조건 충족 못하면 다시 리셋
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
  }, [avgCoord]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {/* 보정 중 표시 */}
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

      {/* 좌표 정보 표시 (왼쪽 상단) */}
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
          <strong>내 위치(RAW):</strong>{' '}
          {userCoord
            ? `${userCoord.lat.toFixed(6)}, ${userCoord.lon.toFixed(6)}`
            : '---, ---'}
        </div>
        <div>
          <strong>평균 좌표:</strong>{' '}
          {avgCoord
            ? `${avgCoord.lat.toFixed(6)}, ${avgCoord.lon.toFixed(6)}`
            : '---, ---'}
        </div>
        <div>
          <strong>오브젝트:</strong>{' '}
          {objectCoord
            ? `${objectCoord.lat.toFixed(6)}, ${objectCoord.lon.toFixed(6)}`
            : '---, ---'}
        </div>
      </div>
    </div>
  );
};

/** 오브젝트(빨간 박스)를 (lon, lat)에 배치 */
function placeRedBox(locar: any, lon: number, lat: number) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(geo, mat);
  locar.add(mesh, lon, lat, 0, { name: 'Red Box' });
}



// export default LocApp;


// export default LocApp