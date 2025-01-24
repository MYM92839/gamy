// ARScene.tsx
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as LocAR from 'locar';  // 타입 선언 필요할 수 있음

/** 권한 상태: 아직 모름, 허용됨, 거부됨 */
type PermissionStatus = 'idle' | 'granted' | 'denied';

/** 모든 권한을 합친 상태 */
interface Permissions {
  location: PermissionStatus;
  orientation: PermissionStatus;
  camera: PermissionStatus;
}

const LocationPrompt: React.FC = () => {
  // 모든 권한 상태를 하나의 state 객체로 관리
  const [permissions, setPermissions] = useState<Permissions>({
    location: 'idle',
    orientation: 'idle',
    camera: 'idle',
  });

  // ARScene 표시 여부
  const allGranted =
    permissions.location === 'granted' &&
    permissions.orientation === 'granted' &&
    permissions.camera === 'granted';

  const anyDenied =
    permissions.location === 'denied' ||
    permissions.orientation === 'denied' ||
    permissions.camera === 'denied';

  /**
   * 권한 결과를 업데이트하는 헬퍼
   */
  const setPermissionState = (key: keyof Permissions, value: PermissionStatus) => {
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
   * - 안드로이드/데스크톱 Chrome 등은 별도 요청 없이 가능한 경우도 있음.
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
      // 별도 권한 요청 필요 없는 환경
      console.log('[Orientation] no permission needed');
      setPermissionState('orientation', 'granted');
    }
  };

  /**
   * 3) 카메라 권한 요청
   * - WebRTC API (navigator.mediaDevices.getUserMedia) 사용.
   */
  const requestCameraPermission = async (): Promise<void> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[Camera] not supported in this browser');
      setPermissionState('camera', 'denied');
      throw new Error('Camera not supported');
    }

    try {
      // 후면 카메라 요청 (facingMode: "environment")
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: 'environment' } },
      });
      console.log('[Camera] granted:', stream);
      setPermissionState('camera', 'granted');
      // 여기서 바로 stream을 사용하거나 정지할 수 있음. (LocAR.WebcamRenderer가 다시 사용할 예정)
      // stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      console.error('[Camera] permission denied or error:', err);
      setPermissionState('camera', 'denied');
      throw err;
    }
  };

  /**
   * "AR 시작하기" 버튼 클릭 시, 3가지 권한을 순차 요청
   */
  const handleStartAR = async () => {
    try {
      // (1) 위치
      await requestLocationPermission();
      // (2) 방향 센서
      await requestOrientationPermission();
      // (3) 카메라
      await requestCameraPermission();
      // 여기까지 오면 allGranted = true 일 가능성 높음
    } catch (err) {
      console.error('[handleStartAR] Some permission was denied or error:', err);
      // 하나라도 거부되면 anyDenied = true 가 됨
    }
  };

  // 권한이 전부 granted면 ARScene 렌더
  if (allGranted) {
    return <LocApp />;
  }

  // 만약 하나라도 거부됐다면
  if (anyDenied) {
    return (
      <div style={{ textAlign: 'center', marginTop: 50 }}>
        <h3>권한이 거부되었습니다.</h3>
        <p>위치 / 센서 / 카메라 권한이 모두 허용되어야 AR이 가능합니다.</p>
        <p>브라우저나 OS 설정에서 권한을 다시 허용한 뒤, 페이지 새로고침 해주세요.</p>
      </div>
    );
  }

  // 아직 클릭 안 했거나, 권한 요청 전
  return (
    <div style={{ textAlign: 'center', marginTop: 50 }}>
      <h2>AR 권한 요청</h2>
      <p>AR 기능을 사용하기 위해 위치 / 자이로(방향) / 카메라 권한이 필요합니다.</p>
      <button onClick={handleStartAR}>AR 시작하기</button>
    </div>
  );
};

export default LocationPrompt


/**
 * GPS 기반 AR을 보여주는 컴포넌트 예시
 */
const LocApp = function () {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationId = 0;

    // -----------------------------------
    // 1) Three.js + LocAR 기본 세팅
    // -----------------------------------
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      80,
      window.innerWidth / window.innerHeight,
      0.001,
      1000
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // DOM에 renderer canvas 추가
    if (containerRef.current) {
      containerRef.current.appendChild(renderer.domElement);
    }

    // 리사이즈 처리
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    // -----------------------------------
    // 2) LocAR 인스턴스 생성
    // -----------------------------------
    const locar = new LocAR.LocationBased(scene, camera);
    const deviceControls = new LocAR.DeviceOrientationControls(camera);
    // 카메라(웹캠) 배경을 AR로 사용
    const cam = new LocAR.WebcamRenderer(renderer);

    // 예: 특정 좌표(경도, 위도)에 빨간 박스
    const boxGeo = new THREE.BoxGeometry(20, 20, 20);
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);

    // locar.add(mesh, longitude, latitude, altitude, {metadata})
    locar.add(boxMesh, 127.9494864, 37.3490689, 0, { name: 'Red Box' });

    // GPS 시작
    locar.startGps();

    // -----------------------------------
    // 3) 애니메이션 루프
    // -----------------------------------
    const animate = () => {
      // 기기 카메라(웹캠) 배경 업데이트
      cam.update();
      // 자이로 센서로 카메라 회전 업데이트
      deviceControls.update();
      // 렌더링
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    // -----------------------------------
    // 정리(cleanup)
    // -----------------------------------
    return () => {
      window.removeEventListener('resize', onResize);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      cancelAnimationFrame(animationId);
    };
  }, []);

  // AR 장면을 표시할 영역
  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};



// export default LocApp