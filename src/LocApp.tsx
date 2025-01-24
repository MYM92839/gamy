// ARScene.tsx
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as LocAR from 'locar';  // 타입 선언 필요할 수 있음

/** 권한 상태: 아직 모름, 허용됨, 거부됨 */
type PermissionStatus = 'idle' | 'granted' | 'denied';

/** 모든 권한을 합친 상태 */
interface Permissions {
  stream: MediaStream | null;
  location: PermissionStatus;
  orientation: PermissionStatus;
  camera: PermissionStatus;
}

const LocationPrompt: React.FC = () => {
  const [permissions, setPermissions] = useState<Permissions>({
    location: 'idle',
    orientation: 'idle',
    camera: 'idle',
    stream: null,
  });

  // 모든 권한이 granted인지
  const allGranted =
    permissions.location === 'granted' &&
    permissions.orientation === 'granted' &&
    permissions.camera === 'granted' &&
    permissions.stream !== null;

  const anyDenied =
    permissions.location === 'denied' ||
    permissions.orientation === 'denied' ||
    permissions.camera === 'denied';

  // 권한을 업데이트하는 헬퍼
  const setPermissionState = (key: keyof Permissions, value: PermissionStatus | MediaStream) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  /**
   * 1) 위치 권한 요청
   */
  const requestLocationPermission = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            console.log('[Location] granted:', pos);
            setPermissionState('location', 'granted');
            resolve();
          },
          (err) => {
            console.error('[Location] denied or error:', err);
            setPermissionState('location', 'denied');
            reject(err);
          }
        );
      } else {
        console.warn('Geolocation not supported.');
        setPermissionState('location', 'denied');
        reject(new Error('Geolocation not supported'));
      }
    });
  };

  /**
   * 2) 방향 센서(자이로) 권한 요청 (iOS 13+)
   */
  const requestOrientationPermission = async (): Promise<void> => {
    const hasOrientationEvent = typeof DeviceOrientationEvent !== 'undefined';
    const needsRequest =
      hasOrientationEvent &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function';

    if (needsRequest) {
      // iOS 13+ 에서는 DeviceOrientationEvent.requestPermission() 필요
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          console.log('[Orientation] granted');
          setPermissionState('orientation', 'granted');
        } else {
          console.log('[Orientation] denied');
          setPermissionState('orientation', 'denied');
          throw new Error('Orientation denied');
        }
      } catch (error) {
        console.error('[Orientation] permission error:', error);
        setPermissionState('orientation', 'denied');
        throw error;
      }
    } else {
      // 별도 권한 요청이 필요 없는 환경
      console.log('[Orientation] no permission needed');
      setPermissionState('orientation', 'granted');
    }
  };

  /**
   * 3) 카메라 권한 요청 (후면 우선, 안 되면 전면으로 fallback)
   */
  const requestCameraPermission = async (): Promise<void> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[Camera] not supported in this browser');
      setPermissionState('camera', 'denied');
      throw new Error('Camera not supported');
    }

    // (A) 먼저 후면 카메라(environment) 시도
    try {
      const envStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: { ideal: 'environment' }, // "ideal" -> 후면 우선, 불가능하면 fallback
        },
      });
      console.log('[Camera] granted (environment):', envStream);
      setPermissionState('camera', 'granted');
      setPermissionState('stream', envStream);
      return;
    } catch (err: any) {
      console.error('[Camera] environment error:', err);

      // (B) Fallback: 전면 카메라(user) 시도
      try {
        const userStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 60 },
            facingMode: { ideal: 'user' }, // 전면 카메라
          },
        });
        console.log('[Camera] granted (user fallback):', userStream);
        setPermissionState('camera', 'granted');
        setPermissionState('stream', userStream);
        return;
      } catch (err2) {
        console.error('[Camera] fallback user error:', err2);
        setPermissionState('camera', 'denied');
        throw err2;
      }
    }
  };

  /**
   * "AR 시작하기" 버튼 핸들러
   */
  const handleStartAR = async () => {
    try {
      // (1) 위치
      await requestLocationPermission();
      // (2) 방향 센서
      await requestOrientationPermission();
      // (3) 카메라
      await requestCameraPermission();
      // 여기까지 오면 allGranted = true (대부분의 경우)
    } catch (err) {
      console.error('[handleStartAR] Some permission was denied or error:', err);
    }
  };

  // 1) 권한 전부 granted + 스트림 존재
  if (allGranted) {
    // ARScene로 이동 (카메라 스트림 전달)
    return <LocApp stream={permissions.stream!} />;
  }

  // 2) 하나라도 거부됨
  if (anyDenied) {
    return (
      <div style={{ textAlign: 'center', marginTop: 50 }}>
        <h3>권한이 거부되었습니다.</h3>
        <p>위치 / 자이로 / 카메라 권한을 모두 허용해야 AR을 사용할 수 있습니다.</p>
        <p>또는 후면 카메라가 없는 기기에서는 전면 카메라를 사용해볼 수 있습니다.</p>
        <p>브라우저나 OS 설정에서 권한을 다시 허용한 뒤 페이지를 새로고침 해 주세요.</p>
      </div>
    );
  }

  // 3) 대기 상태 (idle)
  return (
    <div style={{ textAlign: 'center', marginTop: 50 }}>
      <h2>AR 권한 요청</h2>
      <p>AR 기능(위치 + 자이로 + 카메라)을 사용하려면 권한이 필요합니다.</p>
      <button onClick={handleStartAR}>AR 시작하기</button>
    </div>
  );
};

export default LocationPrompt


interface ARSceneProps {
  stream: MediaStream;
}
/**
 * GPS 기반 AR을 보여주는 컴포넌트 예시
 */
const LocApp = function ({ stream }: ARSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationId = 0;

    // ============== (1) Three.js + LocAR 기본 세팅 ==============
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

    // ============== (2) LocAR 인스턴스 생성 ==============
    const locar = new LocAR.LocationBased(scene, camera);
    const deviceControls = new LocAR.DeviceOrientationControls(camera);

    // 보통은 LocAR.WebcamRenderer 내부에서 getUserMedia를 다시 수행하지만,
    // 이미 우리가 stream을 구해놨기 때문에, LocAR가 스트림을 재사용하도록 할 수도 있습니다.
    // 만약 LocAR가 자체적으로 getUserMedia를 요청하도록 되어 있다면,
    // 여기서 권한은 이미 허용된 상태이므로 문제가 없을 겁니다.

    // LocAR.WebcamRenderer가 "environment" 스트림을 자동으로 열 수도 있는데,
    // 우리는 이미 'stream'을 갖고 있으므로, 필요하다면 아래처럼 수동 설정 가능:
    const cam = new LocAR.WebcamRenderer(renderer);
    //  cam.setStream(stream);
    // ※ locar 라이브러리에 따라 setStream() API 지원 여부가 다를 수 있으니 확인 필요

    // 예시로 특정 좌표(경도, 위도)에 빨간 박스 배치
    const boxGeo = new THREE.BoxGeometry(20, 20, 20);
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);

    // locar.add(mesh, longitude, latitude, altitude, {metadata})
    locar.add(boxMesh, 127.9494864, 37.3490689, 0, { name: 'Red Box' });

    // GPS 시작
    locar.startGps();

    // ============== (3) 애니메이션 루프 ==============
    const animate = () => {
      // 카메라(스트림) 배경 업데이트
      cam.update();
      // 자이로 센서 반영
      deviceControls.update();
      // 씬 렌더링
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    // ============== (4) 정리(cleanup) ==============
    return () => {
      window.removeEventListener('resize', onResize);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      cancelAnimationFrame(animationId);

      // 필요하다면, 스트림 트랙 종료
      // stream.getTracks().forEach((track) => track.stop());
    };
  }, [stream]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};



// export default LocApp