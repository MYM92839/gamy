// ARScene.tsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import * as LocAR from 'locar';  // 타입 선언 필요할 수 있음

/**
 * GPS 기반 AR을 보여주는 컴포넌트 예시
 */
const LocApp = function () {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationId = 0;

    // Three.js 기본 구성
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      80,
      window.innerWidth / window.innerHeight,
      0.001,
      1000
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // DOM에 renderer 추가
    if (containerRef.current) {
      containerRef.current.appendChild(renderer.domElement);
    }

    // 리사이즈 이벤트
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    // LocAR 세팅
    const locar = new LocAR.LocationBased(scene, camera);
    const deviceControls = new LocAR.DeviceOrientationControls(camera);
    const cam = new LocAR.WebcamRenderer(renderer);

    // -------------------------------------------------------
    // 37.3490689, 127.9494864 지점에 빨간 박스 하나 배치
    // -------------------------------------------------------
    const boxGeometry = new THREE.BoxGeometry(20, 20, 20);
    const boxMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);

    // locar.add(mesh, 경도, 위도, 고도, {메타데이터})
    locar.add(boxMesh, 127.9494864, 37.3490689, 0, {
      name: "Red Box",
    });

    // GPS 시작
    locar.startGps();

    // 렌더 루프
    const animate = () => {
      // 카메라(웹캠) 업데이트
      cam.update();
      // 기기 방향(자이로/가속도계 등) → 카메라 회전 반영
      deviceControls.update();
      // 씬 렌더링
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      // 정리(cleanup)
      window.removeEventListener('resize', onResize);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};

export default LocApp