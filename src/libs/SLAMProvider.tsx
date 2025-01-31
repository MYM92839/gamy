import { useThree } from '@react-three/fiber';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlvaAR } from './alva/alva';

// const constraints = {
//   audio: false,
//   video: {
//     facingMode: 'environment',
//     width: 640,
//     height: 480,
//   },
// };

const ARNftContext = createContext({});

const SLAMProvider = ({ children, video, arEnabled }: any) => {
  const { gl, camera } = useThree();

  const [alvaAR, setAlvaAR] = useState<AlvaAR | null>(null); // ✅ AlvaAR 상태 추가
  const alvaARRef = useRef<AlvaAR | null>(null); // ✅ AlvaAR 참조 추가
  const [alvaInitialized, setAlvaInitialized] = useState(false); // ✅ AlvaAR 초기화 여부

  useEffect(() => {
    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 1280, height: 720 },
        });
        video.current.srcObject = stream;
        video.current.onloadedmetadata = async () => {
          console.log("🎥 카메라 메타데이터 로드 완료");

          video.current.play();
          gl.domElement.width = video.current.videoWidth;
          gl.domElement.height = video.current.videoHeight;
          gl.domElement.style.objectFit = "cover";
          camera.rotation.reorder('YXZ');
          camera.updateProjectionMatrix();

          try {

            // ✅ AlvaAR가 이미 초기화되었는지 확인
            if (alvaInitialized) {
              console.log("🚀 AlvaAR는 이미 초기화됨, 다시 실행하지 않음.");
              return;
            }
            let videoWidth = video.current.videoWidth;
            let videoHeight = video.current.videoHeight;


            console.log("🚀 AlvaAR 초기화 중... width:", videoWidth, "height:", videoHeight);
            let alva = await AlvaAR.Initialize(videoWidth, videoHeight);

            if (!alva) {
              console.error("🚨 AlvaAR 초기화 실패!");
              return;
            }

            alvaARRef.current = alva;
            setAlvaAR(alva);
            console.log("✅ AlvaAR SLAM 활성화 완료!");
            setAlvaInitialized(true); // ✅ 한 번 초기화되면 다시 실행 안 함



          } catch (error) {
            console.error("🚨 ARNft 객체 생성 중 오류 발생:", error);
          }
        };
      } catch (error) {
        console.error("🚨 비디오 스트림 초기화 실패:", error);
      }
    }

    if (arEnabled) {
      console.log("🔹 AR 모드 활성화됨! 초기화 시작...");
      init();
    } else {
      console.warn("⚠️ AR 모드가 활성화되지 않음.");
    }
  }, [arEnabled]);

  const value = { alvaAR };

  return <ARNftContext.Provider value={value}>{children}</ARNftContext.Provider>;
};

const useSlam = () => {
  const arValue = useContext(ARNftContext);
  return useMemo(() => ({ ...arValue } as any), [arValue]);
};


export { ARNftContext, SLAMProvider, useSlam };
