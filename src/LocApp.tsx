// ARScene.tsx
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as LocAR from 'locar';  // 타입 선언 필요할 수 있음

const LocationPrompt: React.FC = () => {
  // permission 상태: 'pending' | 'granted' | 'denied'
  const [permission, setPermission] = useState<'pending' | 'granted' | 'denied'>('pending');

  // 위치 요청 함수
  const requestLocationPermission = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('Location granted:', position);
          setPermission('granted');
        },
        (error) => {
          console.error('Location denied or error:', error);
          setPermission('denied');
        }
      );
    } else {
      // geolocation 자체가 없는 환경 (매우 구형 브라우저)
      setPermission('denied');
    }
  };

  // 렌더링 분기
  if (permission === 'pending') {
    return (
      <div style={{ textAlign: 'center', marginTop: 50 }}>
        <h2>위치 정보를 사용해야 AR을 보여줄 수 있습니다.</h2>
        <button onClick={requestLocationPermission}>위치 사용 허용</button>
      </div>
    );
  } else if (permission === 'denied') {
    return (
      <div style={{ textAlign: 'center', marginTop: 50 }}>
        <p>위치 권한이 거부되었습니다. 브라우저/OS 설정을 확인해주세요.</p>
      </div>
    );
  } else {
    // 'granted'인 경우, ARScene을 보여준다
    return <LocApp />;
  }
};

export default LocationPrompt;


/**
 * GPS 기반 AR을 보여주는 컴포넌트 예시
 */
const LocApp = function () {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationId = 0;

    // 기본 Three.js + LocAR 세팅
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

    // 예시로 특정 좌표(경도, 위도)에 박스 하나 배치
    const boxGeo = new THREE.BoxGeometry(20, 20, 20);
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);

    // 경도(longitude), 위도(latitude) 순서
    locar.add(boxMesh, 127.9494864, 37.3490689, 0, { name: 'Red Box' });

    // GPS 시작
    locar.startGps();

    // 렌더 루프
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

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};


// export default LocApp