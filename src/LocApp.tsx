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
   * 위치 권한 요청
   */
  const requestLocationPermission = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            console.log('Location granted:', pos);
            setPermissionState('location', 'granted');
            resolve();
          },
          (err) => {
            console.error('Location error or denied:', err);
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
   * 방향 센서(자이로) 권한 요청 (iOS 13+)
   * - 안드로이드/데스크톱 Chrome은 별도 요청 없이 가능할 때도 있음.
   */
  const requestOrientationPermission = async (): Promise<void> => {
    // iOS 13+ 에서는 DeviceOrientationEvent.requestPermission() 필요
    const hasOrientationEvent = (typeof DeviceOrientationEvent !== 'undefined');
    const needsRequest = hasOrientationEvent && typeof (DeviceOrientationEvent as any).requestPermission === 'function';

    if (needsRequest) {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          setPermissionState('orientation', 'granted');
        } else {
          setPermissionState('orientation', 'denied');
          throw new Error('Orientation denied');
        }
      } catch (error) {
        console.error('Orientation permission error:', error);
        setPermissionState('orientation', 'denied');
        throw error;
      }
    } else {
      // 별도 권한 요청이 필요 없는 환경
      setPermissionState('orientation', 'granted');
    }
  };

  /**
   * 카메라 권한 요청
   * - WebRTC API (navigator.mediaDevices.getUserMedia) 사용.
   */
  const requestCameraPermission = async (): Promise<void> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('Camera not supported in this browser');
      setPermissionState('camera', 'denied');
      throw new Error('Camera not supported');
    }

    try {
      // 후면 카메라 사용 (facingMode: "environment")
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: 'environment' } },
        // audio: false, // 필요없으면 생략
      });
      // 스트림 얻기 성공 → 카메라 권한 허용
      console.log('Camera stream granted:', stream);
      setPermissionState('camera', 'granted');
      // 카메라 스트림은 LocAR.WebcamRenderer에서 다시 요청할 것이므로,
      // 여기서는 사용하지 않아도 됨. 미리 권한만 받아놓는 것.
      // stream.getTracks().forEach((track) => track.stop());  // 필요 시 즉시 해제
    } catch (err) {
      console.error('Camera permission denied or error:', err);
      setPermissionState('camera', 'denied');
      throw err;
    }
  };

  /**
   * 페이지 로드 시점에 모든 권한 요청
   * (일부 브라우저에서는 사용자 제스처 없다고 막힐 수 있음)
   */
  useEffect(() => {
    (async () => {
      try {
        await requestLocationPermission();
      } catch (err) {
        // 위치 권한 거부된 경우
      }

      try {
        await requestOrientationPermission();
      } catch (err) {
        // 방향 권한 거부된 경우
      }

      try {
        await requestCameraPermission();
      } catch (err) {
        // 카메라 권한 거부된 경우
      }
    })();
  }, []);

  /**
   * 3개 권한 모두 granted인지 체크
   */
  const allGranted =
    permissions.location === 'granted' &&
    permissions.orientation === 'granted' &&
    permissions.camera === 'granted';

  const anyDenied =
    permissions.location === 'denied' ||
    permissions.orientation === 'denied' ||
    permissions.camera === 'denied';

  // 1) 대기 중 상태 (3개 모두 결정되지 않은 경우)
  const stillChecking = Object.values(permissions).includes('idle');

  if (stillChecking) {
    return (
      <div style={{ textAlign: 'center', marginTop: 50 }}>
        권한 요청 중입니다...
      </div>
    );
  }

  // 2) 하나라도 거부됨
  if (anyDenied) {
    return (
      <div style={{ textAlign: 'center', marginTop: 50 }}>
        <h3>권한이 거부되었습니다.</h3>
        <p>위치 / 센서 / 카메라 권한 모두 허용해야 AR이 가능합니다.</p>
        <p>브라우저나 OS 설정에서 권한을 다시 허용해 주세요.</p>
      </div>
    );
  }

  // 3) 모두 허용됨
  if (allGranted) {
    return <LocApp />;
  }

  // 혹시 모를 기타 케이스
  return (
    <div style={{ textAlign: 'center', marginTop: 50 }}>
      알 수 없는 권한 상태입니다: {JSON.stringify(permissions)}
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
    const cam = new LocAR.WebcamRenderer(renderer);

    // AR 오브젝트 예: 특정 좌표(경도, 위도)에 빨간 박스
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