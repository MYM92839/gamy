// ARScene.tsx
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as LocAR from 'locar';  // 타입 선언 필요할 수 있음

type PermissionStatus = 'idle' | 'granted' | 'denied';

const LocationPrompt: React.FC = () => {
  const [locationPermission, setLocationPermission] = useState<PermissionStatus>('idle');
  const [orientationPermission, setOrientationPermission] = useState<PermissionStatus>('idle');

  useEffect(() => {
    // -------------------------
    // 1) 위치 권한 요청
    // -------------------------
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log('Location granted:', pos);
          setLocationPermission('granted');
        },
        (err) => {
          console.error('Location error or denied:', err);
          setLocationPermission('denied');
        }
      );
    } else {
      // geolocation API 미지원 환경
      setLocationPermission('denied');
    }

    // -------------------------
    // 2) 기기 방향(자이로) 권한 요청
    //    iOS 13+에서 필요할 수 있음.
    // -------------------------
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof (DeviceOrientationEvent as any).requestPermission === 'function') {

      (DeviceOrientationEvent as any).requestPermission()
        .then((response: string) => {
          if (response === 'granted') {
            setOrientationPermission('granted');
          } else {
            setOrientationPermission('denied');
          }
        })
        .catch((err: any) => {
          console.error('Orientation permission error:', err);
          setOrientationPermission('denied');
        });
    } else {
      // 일부 브라우저(안드로이드 Chrome 등)는 별도 요청 없이 접근 가능
      setOrientationPermission('granted');
    }
  }, []);

  // (A) 아직 권한 결과를 기다리는 중
  if (locationPermission === 'idle' || orientationPermission === 'idle') {
    return <div style={{ textAlign: 'center', marginTop: 50 }}>권한 확인 중...</div>;
  }

  // (B) 권한 거부된 경우
  if (locationPermission === 'denied' || orientationPermission === 'denied') {
    return <div style={{ textAlign: 'center', marginTop: 50 }}>권한이 거부되었습니다. 브라우저/OS 설정을 확인해주세요.</div>;
  }

  // (C) 위치와 자이로 모두 허용된 경우 -> ARScene 표시
  return <LocApp />;
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

    // 예: (경도=127.9494864, 위도=37.3490689)에 빨간 박스 하나 놓기
    const boxGeo = new THREE.BoxGeometry(20, 20, 20);
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);

    // locar.add(mesh, longitude, latitude, altitude, {properties})
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
    // 정리 (cleanup)
    // -----------------------------------
    return () => {
      window.removeEventListener('resize', onResize);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      cancelAnimationFrame(animationId);
    };
  }, []);

  // 실제로 AR 장면을 표시할 영역
  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};



// export default LocApp