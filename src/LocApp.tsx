import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { LocationBased, WebcamRenderer, DeviceOrientationControls } from './libs/location.mjs';
import * as THREEx from './libs/threex.js';

THREEx.ArToolkitContext.baseURL = '../public'

const ARApp: React.FC = () => {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [trackingStatus, setTrackingStatus] = useState('초기화 중...');
  const [userPosition, setUserPosition] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('ar-container')?.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ARToolkit setup
    const arToolkitSource = new THREEx.ArToolkitSource({ sourceType: 'webcam' });

    const onResize = () => {
      arToolkitSource.onResizeElement();
      arToolkitSource.copyElementSizeTo(renderer.domElement);
    };

    arToolkitSource.init(() => {
      requestAnimationFrame(() => onResize());
    });

    window.addEventListener('resize', onResize);

    const arToolkitContext = new THREEx.ArToolkitContext({
      cameraParametersUrl: '/camera_para.dat',
      detectionMode: 'mono',
    });

    arToolkitContext.init(() => {
      camera.projectionMatrix.copy(arToolkitContext.getProjectionMatrix());
    });

    new THREEx.ArMarkerControls(arToolkitContext, camera, {
      type: 'pattern',
      patternUrl: '/patt.hiro',
      changeMatrixMode: 'cameraTransformMatrix'
    });

    scene.visible = false;

    // Adding 3D object
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshNormalMaterial();
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // GPS-based AR setup
    const arjs = new LocationBased(scene, camera);
    const webcamRenderer = new WebcamRenderer(renderer, '#video1');

    let orientationControls: DeviceOrientationControls | undefined;
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      orientationControls = new DeviceOrientationControls(camera);
    }

    arjs.on('gpsupdate', (pos) => {
      setUserPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      if (scene.visible) {
        setTrackingStatus('보정 완료');
      } else {
        setTrackingStatus('마커 감지 중...');
      }
    });

    arjs.startGps();

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);

      if (arToolkitSource.ready) {
        arToolkitContext.update(arToolkitSource.domElement);
        scene.visible = camera.visible;
      }

      orientationControls?.update();
      webcamRenderer && webcamRenderer.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', onResize);
      if (rendererRef.current) {
        document.getElementById('ar-container')?.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div id="ar-container" className="relative w-full h-screen">
      <video id="video1" autoPlay playsInline style={{ display: 'none' }}></video>
      <div className="absolute top-4 left-4 bg-white bg-opacity-80 p-4 rounded-lg shadow-lg text-black">
        <h3 className="text-lg font-bold">위치 상태: {trackingStatus}</h3>
        <p className="text-sm">
          현재 위치: {userPosition ? `${userPosition.lat.toFixed(6)}, ${userPosition.lon.toFixed(6)}` : 'N/A'}
        </p>
      </div>
    </div>
  );
};

export default ARApp;
