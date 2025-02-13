import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { usePinch } from '@use-gesture/react';
import { Leva, useControls } from 'leva';
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import { Box, Tree } from './ArApp';
import Back from './assets/icons/Back';
import Capture from './assets/icons/Capture';
import Button from './components/Button';

const isIOS = /(iPad|iPhone|iPod)/.test(navigator.userAgent);

/* -------------- 유틸 함수 ----------------- */
function calcCover(srcWidth: number, srcHeight: number, destWidth: number, destHeight: number) {
  const srcAspect = srcWidth / srcHeight;
  const destAspect = destWidth / destHeight;
  let drawWidth, drawHeight, offsetX, offsetY;
  if (srcAspect > destAspect) {
    drawHeight = destHeight;
    drawWidth = destHeight * srcAspect;
    offsetX = (destWidth - drawWidth) / 2;
    offsetY = 0;
  } else {
    drawWidth = destWidth;
    drawHeight = destWidth / srcAspect;
    offsetX = 0;
    offsetY = (destHeight - drawHeight) / 2;
  }
  return { drawWidth, drawHeight, offsetX, offsetY };
}

/* --- CameraUpdater --- */
function CameraUpdater({
  latestCameraTransformRef,
}: {
  latestCameraTransformRef: React.MutableRefObject<{ position: THREE.Vector3; quaternion: THREE.Quaternion }>;
}) {
  useFrame(({ camera }) => {
    latestCameraTransformRef.current.position.copy(camera.position);
    latestCameraTransformRef.current.quaternion.copy(camera.quaternion);
  });
  return null;
}

/* --- BackgroundVideo --- */
function BackgroundVideo({ streamRef, setIsMount, logDebug }: any) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const handlePageShow = () => {
      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch((err) => {
          console.error('Failed to play stream on pageshow:', err);
        });
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch((err) => {
          console.error('Failed to play stream on visibility change:', err);
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
  useEffect(() => {
    let activeStream: MediaStream;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      .then((stream) => {
        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          videoRef.current.onloadeddata = () => {
            videoRef.current?.play().catch((err) => logDebug('Video play error: ' + err));
            setIsMount(true);
          };
        }
      })
      .catch((err) => {
        logDebug('getUserMedia error: ' + err);
      });

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [streamRef]);

  return (
    <video
      id="three-video"
      ref={videoRef}
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        top: 0,
        left: 0,
        objectFit: 'cover',
        zIndex: 0,
      }}
      autoPlay
      playsInline
      muted
      loop
    />
  );
}

/* --- ModalU --- */
const ModalU = function ({ closeModal, closeSaveModal, setFoto, offscreenCanvas, isMount, cameraFov }: any) {
  const [fotoUrl, setFotoUrl] = useState<string>('');

  useEffect(() => {
    if (isMount) {
      const timeoutId = setTimeout(captureComposite, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [isMount, offscreenCanvas, cameraFov, setFoto]);

  const captureComposite = () => {
    const videoElement = document.querySelector('#three-video') as HTMLVideoElement;
    if (!videoElement) return;
    const rect = videoElement.getBoundingClientRect();
    const containerWidth = rect.width;
    const containerHeight = rect.height;
    const dpr = window.devicePixelRatio || 1;
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = Math.floor(containerWidth * dpr);
    compositeCanvas.height = Math.floor(containerHeight * dpr);
    const ctx = compositeCanvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(dpr, dpr);

    const videoWidth = videoElement.videoWidth;
    const videoHeight = videoElement.videoHeight;
    const videoParams = calcCover(videoWidth, videoHeight, containerWidth, containerHeight);

    ctx.drawImage(
      videoElement,
      videoParams.offsetX,
      videoParams.offsetY,
      videoParams.drawWidth,
      videoParams.drawHeight
    );

    const threeCSSWidth = offscreenCanvas!.width / dpr;
    const threeCSSHeight = offscreenCanvas!.height / dpr;
    const threeParams = calcCover(threeCSSWidth, threeCSSHeight, containerWidth, containerHeight);

    ctx.drawImage(
      offscreenCanvas!,
      threeParams.offsetX,
      threeParams.offsetY,
      threeParams.drawWidth,
      threeParams.drawHeight
    );

    compositeCanvas.toBlob((blob: Blob | null) => {
      if (blob) {
        setFoto(blob);
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onload = () => {
          setFotoUrl(reader.result as string);
        };
      }
    }, 'image/png');
  };

  const handleClose = () => {
    closeModal();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'white',
        borderRadius: '16px',
        width: '100vw',
        height: '100vh',
        padding: '8px',
        zIndex: 100000000,
      }}
      className="overflow-y-hidden"
    >
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }} className="max-h-screen">
        <div style={{ display: 'flex', gap: '8px' }} className="h-max p-4">
          <button onClick={handleClose} style={{ flex: 1 }}>
            다시 찍기
          </button>
          <button onClick={closeSaveModal} style={{ flex: 1 }}>
            저장하기
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {fotoUrl ? (
            <img style={{ width: '100%', height: 'auto', objectFit: 'cover' }} src={fotoUrl} alt="캡처 이미지" />
          ) : (
            <div className="w-screen h-screen bg-white flex items-center justify-center">
              <div role="status" className="inset-0">
                <svg
                  aria-hidden="true"
                  className="w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600"
                  viewBox="0 0 100 101"
                  fill="none"
                >
                  <path
                    d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                    fill="currentColor"
                  />
                  <path
                    d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                    fill="currentFill"
                  />
                </svg>
                <span className="sr-only">Loading...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* --- DeviceOrientationController (iOS 전용) --- */
interface DeviceOrientationControllerProps {
  isPermissionGranted: boolean;
  target: THREE.Vector3 | [number, number, number];
  distance?: number;
  resetTrigger: number;
}
function DeviceOrientationController({
  isPermissionGranted,
  target,
  distance = 15,
  resetTrigger,
}: DeviceOrientationControllerProps) {
  const { camera } = useThree();
  const [permissionGranted, setPermissionGranted] = useState(isPermissionGranted);
  const initialQuaternion = useRef<THREE.Quaternion | null>(null);

  useEffect(() => {
    function handleOrientation(event: DeviceOrientationEvent) {
      const alpha = event.alpha ? THREE.MathUtils.degToRad(event.alpha) : 0;
      const beta = event.beta ? THREE.MathUtils.degToRad(event.beta) : 0;
      const gamma = event.gamma ? THREE.MathUtils.degToRad(event.gamma) : 0;
      const euler = new THREE.Euler();
      if (isIOS) {
        euler.set(beta, alpha, -gamma, 'YXZ');
        const correctionQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        camera.quaternion.setFromEuler(euler);
        camera.quaternion.multiply(correctionQuaternion);
      } else {
        euler.set(beta, alpha, -gamma, 'YXZ');
        const correctionQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        const computedQuaternion = new THREE.Quaternion().setFromEuler(euler);
        computedQuaternion.multiply(correctionQuaternion);
        if (!initialQuaternion.current) {
          initialQuaternion.current = computedQuaternion.clone();
        }
        const inv = initialQuaternion.current.clone().invert();
        const relativeQuat = inv.multiply(computedQuaternion);
        camera.quaternion.copy(relativeQuat);
      }
      camera.up.set(0, 1, 0);
    }

    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      (DeviceOrientationEvent as any)
        .requestPermission()
        .then((response: any) => {
          if (response === 'granted') {
            setPermissionGranted(true);
            window.addEventListener('deviceorientation', handleOrientation, true);
          } else {
            console.warn('DeviceOrientation permission not granted.');
          }
        })
        .catch((error: any) => {
          console.error('DeviceOrientation permission request error:', error);
        });
    } else {
      if (permissionGranted) {
        window.addEventListener('deviceorientation', handleOrientation, true);
      }
    }
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [camera, permissionGranted, resetTrigger]);

  useFrame(() => {
    const targetVec = Array.isArray(target) ? new THREE.Vector3(target[0], target[1], target[2]) : target;
    const offset = new THREE.Vector3(0, 0, distance);
    offset.applyQuaternion(camera.quaternion);
    camera.position.copy(targetVec).add(offset);
  });

  return null;
}

/* --- SceneIOS --- */
interface SceneProps {
  oposition: any;
  char: string;
  sposition: any;
  scale: number;
  cposition: any;
  addGl: any;
  visible: boolean;
  glRef: any;
  cscale: number;
  calibrationMatrixRef: React.MutableRefObject<THREE.Matrix4 | null>;
  rabbitPosition: [number, number, number];
}
function SceneIOS({
  visible,
  glRef,
  cscale,
  rabbitPosition,
  oposition,
  cposition,
  sposition,
  addGl,
  char,
  scale,
  rabbitRotation, // 추가
}: SceneProps & any) {
  const { gl, camera, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (glRef.current) {
      glRef.current.camera = camera;
      glRef.current.scene = scene;
      glRef.current.gl = gl;
    }
  });
  useEffect(() => {
    if (gl) {
      glRef.current = { gl, camera, scene };
      addGl(glRef.current);
    }
  }, [camera, gl, glRef, scene]);

  useEffect(() => {
    if (isIOS) {
      if (visible && groupRef.current) {
        if (char === 'moons') {
          groupRef.current.position.set(
            rabbitPosition[0] + cposition.x,
            rabbitPosition[1] + cposition.y + 0.2,
            rabbitPosition[2] + cposition.z
          );
        } else {
          groupRef.current.position.set(
            rabbitPosition[0] + cposition.x,
            rabbitPosition[1] + cposition.y + 1,
            rabbitPosition[2] + cposition.z
          );
        }
      }
    } else {
      if (visible && groupRef.current) {
        // non-iOS: 위치는 그대로 유지하고, 아래 useEffect에서 회전값을 업데이트합니다.
        if (char === 'moons') {
          groupRef.current.position.set(
            rabbitPosition[0] + cposition.x,
            rabbitPosition[1] + cposition.y - 0.6,
            rabbitPosition[2] + cposition.z
          );
        } else {
          groupRef.current.position.set(
            rabbitPosition[0] + cposition.x,
            rabbitPosition[1] + cposition.y - 1.6,
            rabbitPosition[2] + cposition.z
          );
        }
      }
    }
  }, [visible, rabbitPosition, cposition, char]);

  // // non-iOS: 카메라의 yaw 값을 추출해 모델의 Y축 회전을 업데이트합니다.
  // useEffect(() => {
  //   if (!isIOS && groupRef.current && camera) {
  //     const euler = new THREE.Euler();
  //     euler.setFromQuaternion(camera.quaternion, 'YXZ');
  //     // 모델의 기본 정면과 카메라의 정면이 일치하지 않으면 보정값(offset)을 추가하세요.
  //     if (char === 'moons') {
  //       groupRef.current.rotation.y = euler.y - Math.PI / 4; // 예: + Math.PI (보정이 필요하다면 추가)
  //       groupRef.current.rotation.z = euler.z;
  //       groupRef.current.rotation.x = euler.x;
  //     } else {
  //       groupRef.current.rotation.y = euler.y - Math.PI / 4; // 예: + Math.PI (보정이 필요하다면 추가)
  //       groupRef.current.rotation.z = euler.z;
  //       groupRef.current.rotation.x = euler.x;
  //     }
  //   }
  // }, [camera, visible]);

  // non-iOS: 한 번만 rabbitRotation을 적용
  useEffect(() => {
    if (!isIOS && visible && groupRef.current && rabbitRotation) {
      groupRef.current.rotation.copy(rabbitRotation);
    }
  }, [visible, rabbitRotation]);

  return isIOS ? (
    <>
      <ambientLight intensity={3} />
      <Suspense fallback={null}>
        {visible &&
          (char === 'moons' ? (
            <group
              ref={groupRef}
              position={[
                rabbitPosition[0] + cposition.x,
                rabbitPosition[1] + cposition.y + 0.2,
                rabbitPosition[2] + cposition.z,
              ]}
              rotation={[-Math.PI, -Math.PI / 4, 0]}
              scale={cscale * 0.25}
              visible={visible}
            >
              <Box
                sposition={[sposition.x, sposition.y, sposition.z]}
                oposition={[oposition.x, oposition.y - 3.5, oposition.z]}
                sscale={scale * 0.85}
                on={true}
                onRenderEnd={() => {}}
              />
            </group>
          ) : (
            <group
              ref={groupRef}
              position={[
                rabbitPosition[0] + cposition.x,
                rabbitPosition[1] + cposition.y + 1,
                rabbitPosition[2] + cposition.z,
              ]}
              rotation={[-Math.PI, -Math.PI / 4, 0]}
              scale={cscale * 0.5}
              visible={visible}
            >
              <Tree
                oposition={[oposition.x, oposition.y, oposition.z]}
                sscale={scale * 0.6}
                on={true}
                onRenderEnd={() => {}}
              />
            </group>
          ))}
      </Suspense>
    </>
  ) : (
    <>
      <ambientLight intensity={3} />
      <Suspense fallback={null}>
        {visible &&
          (char === 'moons' ? (
            <group
              ref={groupRef}
              position={[
                rabbitPosition[0] + cposition.x,
                rabbitPosition[1] + cposition.y - 1,
                rabbitPosition[2] + cposition.z,
              ]}
              rotation={[0, -Math.PI / 4, 0]}
              scale={cscale * 0.25}
              visible={visible}
            >
              <Box
                sposition={[sposition.x, sposition.y, sposition.z]}
                oposition={[oposition.x, oposition.y - 3.5, oposition.z]}
                sscale={scale * 0.85}
                on={true}
                onRenderEnd={() => {}}
              />
            </group>
          ) : (
            <group
              ref={groupRef}
              position={[
                rabbitPosition[0] + cposition.x,
                rabbitPosition[1] + cposition.y - 1.2,
                rabbitPosition[2] + cposition.z,
              ]}
              rotation={[0, -Math.PI / 4, 0]}
              // rotation prop 제거 – 회전은 useEffect에서 처리됨
              scale={cscale * 0.5}
              visible={visible}
            >
              <Tree
                oposition={[oposition.x, oposition.y, oposition.z]}
                sscale={scale * 0.6}
                on={true}
                onRenderEnd={() => {}}
              />
            </group>
          ))}
      </Suspense>
    </>
  );
}

/* --- UIOverlayIOS --- */
interface UIOverlayProps {
  correctPose: any;
  modalIsOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  closeSaveModal: () => void;
  show: boolean;
  setShow: (v: boolean) => void;
  domWidth: number;
  domHeight: number;
  circleX: number;
  circleY: number;
  circleR: number;
  circleColor: string;
  char: string;
  fotoUrl: string;
  cameraFov: number;
}
function UIOverlayIOS({
  openModal,
  setShow,
  domWidth,
  domHeight,
  circleX,
  circleY,
  circleR,
  correctPose,
  char,
}: UIOverlayProps) {
  const [init, setInit] = useState(false);
  const [radius, setRadius] = useState(circleR);
  const [scale, setScale] = useState(0.7);
  const bind = usePinch((state) => {
    if (char === 'moons') {
      setRadius(circleR * state.offset[0]);
    } else {
      setScale(scale * state.offset[0]);
    }
  });
  const [searchParams] = useSearchParams();
  const cv = searchParams.get('cv');
  const getPosition = () => {
    const saved = localStorage.getItem('levaValues');
    if (saved) {
      const base = char === 'moons' ? 'https://gamy-six.vercel.app/rabbit' : 'https://gamy-six.vercel.app/tree';
      const { oposition, sposition, cposition, sscale, cscale } = JSON.parse(saved);
      const text = `${base}?ox=${oposition.x}&oy=${oposition.y}&oz=${oposition.z}&cx=${cposition.x}&cy=${cposition.y}&cz=${cposition.z}&sx=${sposition.x}&sy=${sposition.y}&sz=${sposition.z}&ss=${sscale}&cs=${cscale}`;
      navigator.clipboard
        .writeText(text)
        .then(() => alert('복사되었습니다. 원하는 곳에 붙여넣기하여 주세요.'))
        .catch(() => prompt('키보드의 ctrl+C 또는 마우스 오른쪽의 복사하기를 이용해주세요.', text));
    }
  };
  return (
    <div {...bind()} style={{ position: 'fixed', inset: 0, pointerEvents: 'auto', zIndex: 99999 }}>
      {cv && (
        <button
          style={{
            position: 'fixed',
            top: '30%',
            right: '24px',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '8px',
            color: 'white',
            padding: '1rem',
            border: 'none',
            zIndex: 99999,
          }}
          onClick={getPosition}
        >
          위치저장
        </button>
      )}
      <button
        style={{
          position: 'fixed',
          bottom: '21px',
          left: '24px',
          background: 'transparent',
          border: 'none',
          zIndex: 99999,
        }}
        onClick={() => {
          window.location.href =
            char === 'moons' ? 'https://gamy-six.vercel.app/rabbit' : 'https://gamy-six.vercel.app/tree';
        }}
      >
        <Back />
      </button>
      <button
        style={{
          position: 'fixed',
          bottom: '0px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'transparent',
          border: 'none',
          padding: '1rem',
          zIndex: 99999,
        }}
        onClick={openModal}
      >
        <Capture />
      </button>
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        {char === 'moons' ? (
          <svg width={domWidth} height={domHeight}>
            <circle
              cx={circleX}
              cy={circleY}
              r={radius}
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeDasharray="4, 4"
            />
          </svg>
        ) : (
          <svg
            id="tree"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 595.28 841.89"
            width={domWidth}
            height={domHeight}
            style={{ transform: `scale(${scale * 0.7}) translateY(0%)` }}
          >
            <g id="Layer_2_00000049944092468416363100000003561816792095906952_">
              <path
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeMiterlimit="10"
                strokeDasharray="1,5,0,0,1,0"
                d="M167,128.3l-17-5h-15h-15l-10,12l-10,37v23l7,17l16,22l10.5,10l14.5,28l5,28l5,27.2l1,21.8l2,24l6,37l7,34l-6,25v21l1,16c0,0-9,14-11,18s-16,34-16,34l-11,18l-5,25l-4,13l-16,26l-15,18l-11,14l-16,8l-16,11v8l25,6h21h26c0,0,15-15,20-16s23-4,23-4l20,12l23,1c0,0,15-13,23-13s22,7,28,10s28,19,28,19l35,10.6l15,9.4h21h38h45l25-14l31-16l19-8l9-22l-5-21l-25-40l-4-21l-11-33l-10-14l-11-12l-12-15l4-14l1-20v-21l-3-20l-1-14.5l3-11.5l-2-15l8-12l-3-20l-1-11l-1-23.9l11-14.1l8-7l5-11l2-13l11-14v-14l9-15l8-22l4-8l5-11l4-19l6-7l14-17l-11-20l-12-20l-28-13h-24l-15,22l-15,16l-11,19l-13,14l-2,16l-4,20l-10,21l-12,16l-13,11l-2-30v-18c0,0,1-20,3-25s7-26,7-26l7-14l4-15l-14-27c0,0-26-21-29-21s-57-8-57-8h-37l-30.9,16.3l-10.7,5.6l-15.4,8.1L167,128.3z"
              />
            </g>
          </svg>
        )}
      </div>
      <Button
        onClick={() => {
          if (!init) {
            setInit(true);
          }
          correctPose();
          setShow(false);
          setTimeout(() => setShow(true), 1000);
        }}
        title={
          init
            ? `${char === 'moons' ? '토끼' : '관찰사'} 다시 부르기`
            : `${char === 'moons' ? '토끼' : '관찰사'} 부르기`
        }
        className="z-[9999] fixed bottom-[20%] left-1/2 -translate-x-1/2 w-max mx-auto p-4 h-fit"
      />
    </div>
  );
}

/* --- IOSARCanvasCore --- */
function IOSARCanvasCore(props: any) {
  const { latestCameraTransformRef, orientationEnabled } = props;
  const [searchParams] = useSearchParams();
  const ox = searchParams.get('ox') ? parseFloat(searchParams.get('ox')!) : 0;
  const oy = searchParams.get('oy') ? parseFloat(searchParams.get('oy')!) : 0;
  const oz = searchParams.get('oz') ? parseFloat(searchParams.get('oz')!) : 0;
  const cx = searchParams.get('cx') ? parseFloat(searchParams.get('cx')!) : 0;
  const cy = searchParams.get('cy') ? parseFloat(searchParams.get('cy')!) : 0;
  const cz = searchParams.get('cz') ? parseFloat(searchParams.get('cz')!) : 0;
  const sx = searchParams.get('sx') ? parseFloat(searchParams.get('sx')!) : 0;
  const sy = searchParams.get('sy') ? parseFloat(searchParams.get('sy')!) : 0;
  const sz = searchParams.get('sz') ? parseFloat(searchParams.get('sz')!) : 0;
  const ss = searchParams.get('ss') ? parseFloat(searchParams.get('ss')!) : 1;
  const cs = searchParams.get('cs') ? parseFloat(searchParams.get('cs')!) : 1;
  const initialValues = useMemo(() => {
    const saved = localStorage.getItem('levaValues');
    if (
      ox !== undefined ||
      oy !== undefined ||
      oz !== undefined ||
      cx !== undefined ||
      cy !== undefined ||
      cz !== undefined ||
      sx !== undefined ||
      sy !== undefined ||
      sz !== undefined ||
      ss !== undefined ||
      cs !== undefined
    ) {
      return {
        oposition: { x: ox, y: oy, z: oz },
        sposition: { x: sx, y: sy, z: sz },
        cposition: { x: cx, y: cy, z: cz },
        sscale: ss,
        cscale: cs,
      };
    } else if (saved) {
      try {
        return JSON.parse(saved);
      } catch (error) {
        console.error('Leva parse failed:', error);
      }
    }
    return {
      oposition: { x: 0, y: 0, z: 0 },
      sposition: { x: 0, y: 0, z: 0 },
      cposition: { x: 0, y: 0, z: 0 },
      sscale: 1,
      cscale: 1,
    };
  }, []);
  const { oposition, sposition, cposition } = useControls({
    oposition: { value: initialValues.oposition, step: 0.1 },
    sposition: { value: initialValues.sposition, step: 0.1 },
    cposition: { value: initialValues.cposition, step: 0.1 },
  });
  const { sscale, cscale } = useControls({
    sscale: initialValues.sscale || 1,
    cscale: initialValues.cscale || 1,
  });
  useEffect(() => {
    localStorage.setItem('levaValues', JSON.stringify({ oposition, sposition, cposition, sscale, cscale }));
  }, [oposition, sposition, cposition, sscale, cscale]);
  return (
    <>
      <CameraUpdater latestCameraTransformRef={latestCameraTransformRef} />
      <DeviceOrientationController
        resetTrigger={props.resetTrigger}
        target={props.rabbitPosition}
        isPermissionGranted={orientationEnabled}
      />
      <SceneIOS
        visible={props.show}
        glRef={props.glRef}
        addGl={(gl: any) => {
          props.glRef.current = gl;
        }}
        calibrationMatrixRef={props.calibrationMatrixRef}
        rabbitPosition={props.rabbitPosition}
        sposition={sposition}
        oposition={oposition}
        cposition={cposition}
        scale={sscale}
        char={props.char}
        cscale={cscale}
      />
    </>
  );
}

/* --- IOSARCanvas --- */
function IOSARCanvas(props: any) {
  const [, setInit] = useState(false);
  const glRef = useRef<any>(null);
  const latestCameraTransformRef = props.latestCameraTransformRef;
  const [orientationEnabled] = useState(true);
  const [searchParams] = useSearchParams();
  const cv = searchParams.get('cv');
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <BackgroundVideo streamRef={props.streamRef} setIsMount={props.setIsMount} logDebug={props.logDebug} />
      <Canvas
        id="three-canvas"
        style={{ width: '100vw', height: '100vh', background: 'transparent', position: 'relative', zIndex: 10 }}
        gl={{ alpha: true, preserveDrawingBuffer: true }}
        camera={{ fov: 30 }}
        onCreated={(state) => {
          state.gl.setPixelRatio(window.devicePixelRatio);
          state.gl.setSize(window.innerWidth, window.innerHeight);
          setInit(true);
          props.logDebug('Canvas created, init set to true (iOS version).');
          const offscreen = document.createElement('canvas');
          offscreen.width = Math.floor(window.innerWidth * window.devicePixelRatio);
          offscreen.height = Math.floor(window.innerHeight * window.devicePixelRatio);
          props.setOffscreenCanvas(offscreen);
          props.logDebug('Offscreen canvas created in IOSARCanvas.');
        }}
      >
        <IOSARCanvasCore
          {...props}
          glRef={glRef}
          resetTrigger={props.resetTrigger}
          latestCameraTransformRef={latestCameraTransformRef}
          orientationEnabled={orientationEnabled}
        />
      </Canvas>
      <UIOverlayIOS
        modalIsOpen={props.modalIsOpen}
        fotoUrl={''}
        correctPose={() => props.correctPose(glRef.current)}
        openModal={() => props.openModal(glRef.current)}
        closeModal={props.closeModal}
        closeSaveModal={props.closeSaveModal}
        show={props.show}
        setShow={props.setShow}
        domWidth={props.domWidth}
        domHeight={props.domHeight}
        circleX={props.circleX}
        circleY={props.circleY}
        circleR={props.circleR}
        circleColor={props.circleColor}
        cameraFov={props.cameraFov}
        char={props.char}
      />
      <div style={{ position: 'fixed', display: cv ? 'block' : 'none', top: 0, zIndex: 99999999 }}>
        <Leva collapsed={false} />
      </div>
    </div>
  );
}

/* --- DebugPanel --- */
// function DebugPanel({
//   logs,
//   cameraTransformRef,
// }: {
//   logs: string[];
//   cameraTransformRef: React.MutableRefObject<{ position: THREE.Vector3; quaternion: THREE.Quaternion }>;
// }) {
//   const [transform, setTransform] = useState({
//     position: new THREE.Vector3(),
//     quaternion: new THREE.Quaternion(),
//   });
//   useEffect(() => {
//     const interval = setInterval(() => {
//       if (cameraTransformRef.current) {
//         setTransform({
//           position: cameraTransformRef.current.position.clone(),
//           quaternion: cameraTransformRef.current.quaternion.clone(),
//         });
//       }
//     }, 500);
//     return () => clearInterval(interval);
//   }, [cameraTransformRef]);

//   return (
//     <div
//       style={{
//         position: 'fixed',
//         bottom: 0,
//         left: 0,
//         right: 0,
//         maxHeight: '200px',
//         overflowY: 'scroll',
//         background: 'rgba(0,0,0,0.7)',
//         color: 'white',
//         fontSize: '12px',
//         padding: '8px',
//         zIndex: 100000,
//       }}
//     >
//       <div>
//         <strong>Camera Pos:</strong> {transform.position.x.toFixed(2)}, {transform.position.y.toFixed(2)},{' '}
//         {transform.position.z.toFixed(2)}
//       </div>
//       <div>
//         <strong>Camera Q:</strong> {transform.quaternion.x.toFixed(2)}, {transform.quaternion.y.toFixed(2)},{' '}
//         {transform.quaternion.z.toFixed(2)}, {transform.quaternion.w.toFixed(2)}
//       </div>
//       <div>
//         <strong>Logs:</strong>
//       </div>
//       {logs.map((log, i) => (
//         <div key={i}>{log}</div>
//       ))}
//     </div>
//   );
// }

/* --- BasicApp --- */
export default function BasicApp() {
  const xrStoreRef = useRef<any>(null);
  const [mount, setMount] = useState(false);
  const [, setSessionStarted] = useState(false);
  const [modalIsOpen, setIsOpen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [show, setShow] = useState(false);
  const { char } = useParams();
  const streamRef = useRef<MediaStream | null>(null);
  const [isMount, setIsMount] = useState(false);
  const [offscreenCanvas, setOffscreenCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cameraFov] = useState<number>(60);
  const calibrationMatrixRef = useRef<THREE.Matrix4 | null>(null);
  const [rabbitPosition, setRabbitPosition] = useState<[number, number, number]>([0, 0, 0]);
  // const [debugLogs, setDebugLogs] = useState<string[]>([]);
  // const [showDebug, setShowDebug] = useState<boolean>(true);
  const [rabbitRotation, setRabbitRotation] = useState<THREE.Euler | null>(null);

  const logDebug = (msg: any, ...opt: any[]) => {
    console.log(msg, ...opt);
    /// setDebugLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    console.log('Calibration ref in BasicApp:', calibrationMatrixRef.current);
  }, []);

  const domWidth = 700;
  const domHeight = 1100;
  const circleX = domWidth / 2;
  const circleY = domHeight / 2;
  const circleR = 120;
  const latestCameraTransform = useRef({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  });

  useEffect(() => {
    setMount(true);
  }, []);

  const [resetTrigger, setResetTrigger] = useState(0);
  const correctPose = (glRefObj: any) => {
    if (isIOS) {
      if (!glRefObj) return;
      let pos = { x: 0, y: 0, z: 0 };
      const saved = localStorage.getItem('levaValues');
      if (saved) {
        try {
          const s = JSON.parse(saved);
          pos = s.cposition;
        } catch (error) {
          console.error('levaValues parse fail:', error);
        }
      }
      const cameraPos = latestCameraTransform.current.position.clone();
      const cameraQuat = latestCameraTransform.current.quaternion.clone();
      // iOS에서는 기존 로직 사용
      const offset = new THREE.Vector3(0, 0, 0);
      offset.applyQuaternion(cameraQuat);
      const newPosition = cameraPos.add(offset);
      setRabbitPosition([newPosition.x + pos.x, newPosition.y + pos.y, newPosition.z + pos.z]);
      logDebug('iOS Rabbit position updated:', newPosition);
      setResetTrigger((prev) => prev + 1);
    } else {
      // non-iOS: 카메라의 forward(수평) 방향과 yaw값만 남긴 회전을 계산
      // non-iOS: 카메라의 수평 forward 방향을 기준으로 위치와 회전을 보정
      setTimeout(() => {
        if (!glRefObj) return;
        let pos = { x: 0, y: 0, z: 0 };
        const saved = localStorage.getItem('levaValues');
        if (saved) {
          try {
            const s = JSON.parse(saved);
            pos = s.cposition;
          } catch (error) {
            console.error('levaValues parse fail:', error);
          }
        }
        const distance = 5;
        const currentPos = latestCameraTransform.current.position.clone();
        // 카메라의 월드 forward 방향 (수평만 사용)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(latestCameraTransform.current.quaternion);
        forward.y = 0;
        forward.normalize();
        const offset = forward.multiplyScalar(distance);
        const newPosition = currentPos.add(offset);
        setRabbitPosition([newPosition.x + pos.x, newPosition.y + pos.y, newPosition.z + pos.z]);
        console.log('non-iOS Rabbit position updated:', newPosition);

        // 토끼의 회전: 토끼 위치에서 카메라 위치를 바라보도록 계산
        const cameraPos = latestCameraTransform.current.position.clone();
        // LookAt 행렬을 사용하여 회전 Quaternion 계산 (모델의 기본 전방에 맞게 보정 필요시 추가 offset 적용)
        const mat = new THREE.Matrix4().lookAt(newPosition, cameraPos, new THREE.Vector3(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(mat);
        setRabbitRotation(new THREE.Euler().setFromQuaternion(q, 'YXZ'));

        setResetTrigger((prev) => prev + 1);
      }, 30); // 30ms 딜레이 (필요시 조정)
    }
  };

  const openModalHandler = () => {
    const threeCanvas = document.querySelector('#three-canvas')?.children[0].children[0];
    if (threeCanvas && offscreenCanvas) {
      const imgData = (threeCanvas as HTMLCanvasElement).toDataURL();
      const containerWidth = window.innerWidth;
      const containerHeight = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      offscreenCanvas.width = Math.floor(containerWidth * dpr);
      offscreenCanvas.height = Math.floor(containerHeight * dpr);
      const ctx = offscreenCanvas.getContext('2d');
      if (!ctx) {
        logDebug('captureARContent: offscreen canvas context failed.');
        return;
      }
      ctx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      const img = new Image();
      img.onload = () => {
        const params = calcCover(img.width, img.height, offscreenCanvas.width, offscreenCanvas.height);
        ctx.drawImage(img, params.offsetX, params.offsetY, params.drawWidth, params.drawHeight);
      };
      img.src = imgData;
      setMount(false);
      setIsOpen(true);
    }
  };

  const handleCloseSaveModal = async () => {
    if (foto) {
      try {
        if (
          isIOS &&
          navigator.canShare &&
          navigator.canShare({
            files: [new File([foto], 'capture.png', { type: foto.type || 'image/png' })],
          })
        ) {
          const file = new File([foto], `gamyoungar-${new Date().getTime()}.png`, { type: foto.type || 'image/png' });
          await navigator.share({
            files: [file],
            title: 'My Captured Image',
            text: 'Check out this captured photo!',
          });
        } else {
          const url = URL.createObjectURL(foto);
          const link = document.createElement('a');
          link.download = `gamyoungar-${new Date().getTime()}.png`;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        logDebug('Saving failed: ' + error);
      }
    }
    setIsOpen(false);
  };

  return (
    <>
      <IOSARCanvas
        xrStoreRef={xrStoreRef}
        setSessionStarted={setSessionStarted}
        show={show}
        modalIsOpen={modalIsOpen}
        openModal={openModalHandler}
        closeModal={() => {
          setIsOpen(false);
          setShow(false);
        }}
        rabbitRotation={rabbitRotation} // 추가된 prop
        closeSaveModal={handleCloseSaveModal}
        setShow={setShow}
        correctPose={correctPose}
        resetTrigger={resetTrigger}
        domWidth={domWidth}
        domHeight={domHeight}
        circleX={circleX}
        circleY={circleY}
        circleR={circleR}
        char={char}
        circleColor="blue"
        setOffscreenCanvas={setOffscreenCanvas}
        logDebug={logDebug}
        cameraFov={cameraFov}
        calibrationMatrixRef={calibrationMatrixRef}
        rabbitPosition={rabbitPosition}
        latestCameraTransformRef={latestCameraTransform}
        streamRef={streamRef}
        setIsMount={setIsMount}
      />
      {!mount && (
        <ModalU
          isMount={isMount}
          modalIsOpen={modalIsOpen}
          setFoto={setFoto}
          closeModal={() => {
            setIsOpen(false);
            setShow(false);
            setMount(true);
          }}
          isIOS={isIOS}
          closeSaveModal={handleCloseSaveModal}
          offscreenCanvas={offscreenCanvas}
          logDebug={logDebug}
          cameraFov={cameraFov}
        />
      )}
      {/* non-iOS: 디버그 패널 및 토글 버튼 */}
      {/* {!isIOS && (
        <>
          <button
            onClick={() => setShowDebug((prev) => !prev)}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              zIndex: 100001,
              background: 'rgba(0,0,0,0.7)',
              color: 'white',
              padding: '4px 8px',
              border: 'none',
            }}
          >
            {showDebug ? 'Hide Debug' : 'Show Debug'}
          </button>
          {showDebug && <DebugPanel logs={debugLogs} cameraTransformRef={latestCameraTransform} />}
        </>
      )} */}
    </>
  );
}
