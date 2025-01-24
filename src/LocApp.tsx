// ARScene.tsx
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as LocAR from 'locar';  // 타입 선언 필요할 수 있음

type PermissionState = 'idle' | 'granted' | 'denied';


const LocationPrompt: React.FC = () => {
  const [permission, setPermission] = useState<PermissionState>('idle');

  /**
   * "AR 시작하기" 버튼 클릭 → 3가지 권한 요청
   * 1) 자이로(방향 센서)
   * 2) 위치
   * 3) 카메라
   */
  const handleStartAR = () => {
    console.log('[AR] Starting permission chain...');

    // --- (1) 자이로(방향 센서) 권한 ---
    const orientationPromise = new Promise<void>((resolve, reject) => {
      // iOS 13+ 에서는 DeviceOrientationEvent.requestPermission() 필요
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
        // 안드로이드/데스크톱 크롬 등은 별도 권한 없이 가능
        console.log('[Orientation] no permission needed');
        resolve();
      }
    });

    orientationPromise
      // --- (2) 위치 권한 ---
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
            }
          );
        });
      })

      // --- (3) 카메라 권한 (후면 먼저 → 실패 시 전면 fallback) ---
      .then(() => {
        return requestCameraPermission();
      })

      // --- 모두 성공 ---
      .then((stream) => {
        console.log('[Camera] granted!', stream);
        setPermission('granted');
      })

      // --- 하나라도 실패 ---
      .catch((err) => {
        console.error('[AR chain] permission error:', err);
        setPermission('denied');
      });
  };

  // 권한 OK → ARScene 렌더
  if (permission === 'granted') {
    return <LocApp />;
  }

  // 거부됨
  if (permission === 'denied') {
    return (
      <div style={{ textAlign: 'center', marginTop: 50 }}>
        <h3>권한이 거부되었습니다.</h3>
        <p>위치 / 자이로 / 카메라 권한이 모두 허용되어야 AR을 사용할 수 있습니다.</p>
        <p>브라우저나 OS 설정에서 권한을 다시 허용한 뒤 페이지를 새로고침 해 주세요.</p>
      </div>
    );
  }

  // 대기 상태
  return (
    <div style={{ textAlign: 'center', marginTop: 50 }}>
      <h2>AR 권한 요청</h2>
      <p>방향 센서 / 위치 / 카메라 권한을 얻어야 AR을 시작할 수 있습니다.</p>
      <button onClick={handleStartAR}>AR 시작하기</button>
    </div>
  );
};

/**
 * 카메라 권한 요청 (후면 우선, 실패 시 전면 Fallback)
 */
function requestCameraPermission(): Promise<MediaStream> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return Promise.reject(new Error('[Camera] getUserMedia not supported'));
  }

  // 후면 카메라 시도
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
      // 전면 카메라 Fallback
      return navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    });
}

export default LocationPrompt

/**
 * GPS 기반 AR을 보여주는 컴포넌트 예시
 */
const LocApp = function () {
  const containerRef = useRef<HTMLDivElement>(null);

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

    // ============== 3) GPS 업데이트 핸들러 등록 ==============
    let firstPosition = true;

    // gpsupdate가 처음 발생(초기 위치 파악)했을 때 AR 오브젝트 추가
    locar.on('gpsupdate', (pos: GeolocationPosition) => {
      if (firstPosition) {
        console.log('Got initial GPS position:', pos.coords);
        // 이제 오브젝트를 배치해도 에러가 안 납니다.

        // 예: 경도=127.9494864, 위도=37.3490689 지점에 빨간 박스
        const cubeGeo = new THREE.BoxGeometry(20, 20, 20);
        const cubeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);

        // locar.add(mesh, longitude, latitude, altitude, properties)
        locar.add(cubeMesh, 127.9499501, 37.3481715, 0, { name: 'Red Box' });

        // 최초 위치 배치 후 다시 안 부르도록
        firstPosition = false;
      }
    });

    // GPS 활성화
    locar.startGps();

    // ============== 4) 렌더 루프 ==============
    const animate = () => {
      cam.update();          // 카메라(실사) 백그라운드 업데이트
      deviceControls.update(); // 자이로 센서 반영
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

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};



// export default LocApp