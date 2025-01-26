import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as LocAR from 'locar';
import proj4 from 'proj4';

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

  // Refs to manage persistent state across renders
  const isObjectPlacedRef = useRef(false);
  const stableStartTimeRef = useRef(0);
  const locarRef = useRef<any | null>(null);

  // Ref for DIST_THRESHOLD to allow dynamic updates
  const DIST_THRESHOLDRef = useRef(0.00001); // 0.00001 degrees (~1.11 meters)

  // 기준 위치 (오브젝트를 배치할 때의 UTM 좌표)
  const baseCoordRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let animationId = 0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      80,
      window.innerWidth / window.innerHeight,
      0.001,
      1000
    );
    camera.position.set(0, 0, 5); // 카메라를 원점에서 약간 뒤로 이동
    camera.lookAt(0, 0, 0); // 카메라가 원점을 바라보도록 설정

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
    locarRef.current = locar;
    const deviceControls = new LocAR.DeviceOrientationControls(camera);
    const cam = new LocAR.WebcamRenderer(renderer);

    const ACCURACY_THRESHOLD = 10; // GPS 정확도 (미터)
    const STABLE_DURATION_MS = 3000; // 안정화 기간 (밀리초)

    const handleGpsUpdate = (pos: GeolocationPosition, distMoved: number) => {
      const { latitude, longitude, accuracy } = pos.coords;

      // Update user coordinates
      setUserCoord({ lat: latitude, lon: longitude });

      const isAccurateEnough = accuracy <= ACCURACY_THRESHOLD;
      const isMovedSmall = distMoved <= DIST_THRESHOLDRef.current;

      if (!isObjectPlacedRef.current) {
        // 객체가 아직 배치되지 않은 상태
        if (isAccurateEnough && isMovedSmall) {
          if (stableStartTimeRef.current === 0) {
            stableStartTimeRef.current = Date.now();
          } else {
            const stableElapsed = Date.now() - stableStartTimeRef.current;
            if (stableElapsed >= STABLE_DURATION_MS) {
              console.log('[Stable] Placing object...');

              // 기준 위치 설정 및 변환
              const baseUTM = latLonToUTM(latitude, longitude);
              baseCoordRef.current = { x: baseUTM.x, y: baseUTM.y };

              if (locarRef.current) {
                // 오브젝트를 기준 위치에 배치 (상대 좌표로 설정)
                placeRedBox(locarRef.current, 0, 0);
              }
              setObjectCoord({ lat: latitude, lon: longitude });
              isObjectPlacedRef.current = true;
              setIsStabilizing(false);

              // DIST_THRESHOLD을 0으로 설정
              DIST_THRESHOLDRef.current = 0;
            }
          }
        } else {
          stableStartTimeRef.current = 0;
        }
      } else {
        // 객체가 이미 배치된 상태
        // 사용자의 움직임에 따라 객체의 위치를 조정할 필요가 있는지 검사
        if (distMoved > DIST_THRESHOLDRef.current && baseCoordRef.current) {
          console.log('[Movement Detected] Potentially updating object position...');
          // 실제로는 객체의 위치를 업데이트하지 않고, 기준 위치를 유지
          // 필요시 추가 로직 구현
        }
      }
    };

    locar.on('gpsupdate', handleGpsUpdate);

    locar.startGps();

    const animate = () => {
      cam.update();
      deviceControls.update();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', onResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      cancelAnimationFrame(animationId);
      locar.off('gpsupdate', handleGpsUpdate);
      locar.stopGps(); // assuming there's a method to stop GPS updates
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
          {objectCoord
            ? `${objectCoord.lat.toFixed(6)}, ${objectCoord.lon.toFixed(6)}`
            : '---, ---'}
        </div>
      </div>
    </div>
  );
};

/**
 * Places a red box at the specified relative coordinates.
 * @param locar - The LocAR.LocationBased instance.
 * @param x - Relative Easting (meters) from the base location.
 * @param y - Relative Northing (meters) from the base location.
 * @returns The placed THREE.Mesh object.
 */
function placeRedBox(locar: any, x: number, y: number): THREE.Mesh {
  console.log(`placeRedBox at x=${x}, y=${y}`);
  const geo = new THREE.BoxGeometry(1, 1, 1); // 크기 조정 가능
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // 빨간색
  const mesh = new THREE.Mesh(geo, mat);

  // Three.js에서의 위치는 x, y, z로 설정 (z는 높이)
  mesh.position.set(x, y, 0); // z는 필요에 따라 조정

  locar.add(mesh); // locar.add가 어떻게 동작하는지에 따라 조정

  return mesh;
}

/**
 * Converts latitude and longitude to UTM coordinates with automatic zone calculation.
 * @param lat - Latitude in degrees.
 * @param lon - Longitude in degrees.
 * @returns An object containing x (easting), y (northing), and zone.
 */
export function latLonToUTM(lat: number, lon: number): { x: number; y: number; zone: string } {
  // 자동으로 UTM Zone 계산
  const zone = Math.floor((lon + 180) / 6) + 1;
  const hemisphere = lat >= 0 ? 'north' : 'south';

  // WGS84 좌표계 (EPSG:4326)에서 UTM 좌표계로 변환
  const projLatLon = 'EPSG:4326'; // WGS84
  const projUTM = `+proj=utm +zone=${zone} +${hemisphere === 'north' ? 'north' : 'south'} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;

  const [x, y] = proj4(projLatLon, projUTM, [lon, lat]);

  return { x, y, zone: `${zone}${hemisphere === 'north' ? 'N' : 'S'}` };
}