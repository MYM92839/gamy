import { useEffect, useRef, useState } from 'react';
import Capture from './assets/icons/Capture';
import Back from './assets/icons/Back';
import { useParams } from 'react-router-dom';
import Modal from 'react-modal';

const customStyles = {
  overlay: {
    zIndex: 999,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    borderRadius: '16px',
    width: '100dvw',
    height: '100dvh',
    padding: '8px',
    transform: 'translate(-50%, -50%)',
    zIndex: 999,
  },
};

/**
 * 오버레이 스타일
 * - landscape: 컨테이너의 80% 크기로 배치 (왼쪽 하단)
 * - portrait: width는 꽉 차고, height는 콘텐츠에 맞게
 */
const STYLE_MODE: { [key: string]: string } = {
  landscape: 'absolute left-0 bottom-0 w-[80%] h-[80%]',
  portrait: 'absolute left-0 bottom-0 w-full h-auto',
};

Modal.setAppElement('#root');
const isIOS = /(iPad|iPhone|iPod)/.test(navigator.userAgent);

interface FrameAppProps {
  frameOpacity?: number;
  borderWidth?: number;
  borderColor?: string;
}

const FrameApp: React.FC<FrameAppProps> = () => {
  const { char } = useParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const animVideoRef = useRef<HTMLVideoElement>(null);
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [dimensions, setDimensions] = useState({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  });
  const [modalIsOpen, setIsOpen] = useState(false);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string>('');
  const [init, setInit] = useState(false);
  const [orientation, setOrientation] = useState('portrait');
  // 크로스페이드 상태 (false: anim video 보임, true: idle video 보임)
  const [isCrossfade, setIsCrossfade] = useState(false);

  function openModal() {
    setIsOpen(true);
    captureImage();
  }

  function closeModal() {
    setIsOpen(false);
  }

  function closeSaveModal() {
    if (foto) shareOrDownloadImage(foto);
    setIsOpen(false);
  }

  const requestFullScreen = () => {
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if ((element as any).webkitRequestFullscreen) {
      (element as any).webkitRequestFullscreen();
    } else if ((element as any).msRequestFullscreen) {
      (element as any).msRequestFullscreen();
    }
    setInit(true);
  };

  useEffect(() => {
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('getUserMedia가 지원되지 않는 브라우저입니다.');
        return;
      }
      try {
        const constraints = {
          video: { facingMode: 'environment' },
          audio: false,
        };
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch((err) => {
            console.error('Error playing camera video:', err);
          });
        }
      } catch (err) {
        setError('카메라 초기화 실패.');
        console.error('Camera initialization error:', err);
      }
    };
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // 화면 크기 변동 처리
  useEffect(() => {
    const handleResize = () => {
      const parentDiv = videoRef.current?.parentElement;
      if (parentDiv) {
        setDimensions({
          width: parentDiv.clientWidth,
          height: parentDiv.clientHeight,
        });
      }
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((err) => {
          console.error('Error playing camera video after resize:', err);
        });
      }
      if (animVideoRef.current) {
        animVideoRef.current.play().catch((err) => {
          console.error('Error playing anim video after resize:', err);
        });
      }
      if (idleVideoRef.current) {
        idleVideoRef.current.play().catch((err) => {
          console.error('Error playing idle video after resize:', err);
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [stream]);

  // 백그라운드 → 포그라운드 시 재생
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((err) => {
            console.error('Error playing camera video on visibility change:', err);
          });
        }
        if (animVideoRef.current) {
          animVideoRef.current.play().catch((err) => {
            console.error('Error playing anim video on visibility change:', err);
          });
        }
        if (idleVideoRef.current) {
          idleVideoRef.current.play().catch((err) => {
            console.error('Error playing idle video on visibility change:', err);
          });
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [stream]);

  const shareOrDownloadImage = (blob: Blob): void => {
    if (
      isIOS &&
      navigator.canShare &&
      navigator.canShare({ files: [new File([blob], 'test.png', { type: blob.type })] })
    ) {
      const file = new File([blob], `camera-frame-${new Date().getTime()}.png`, {
        type: 'image/png',
      });
      navigator
        .share({
          files: [file],
          title: 'My Captured Image',
          text: 'Check out this captured photo!',
        })
        .catch((error) => {
          console.error('Sharing failed:', error);
        });
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `camera-frame-${new Date().getTime()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  // --- 캡쳐 함수 ---
  const captureImage = async (): Promise<void> => {
    const container = videoRef.current?.parentElement;
    const cameraVideo = videoRef.current;
    // overlay는 현재 crossfade 상태가 1이면 idleVideo, 아니면 animVideo 사용
    const overlayVideo = isCrossfade ? idleVideoRef.current : animVideoRef.current;
    const canvas = canvasRef.current;
    if (!container || !cameraVideo || !overlayVideo || !canvas) {
      console.warn('Required elements not ready');
      return;
    }
    // 1) 캔버스를 부모 컨테이너 크기로 설정
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = containerHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // ----------------------------------------
    // A. 카메라 영상 (object-fit: cover 방식)
    // ----------------------------------------
    const camRect = cameraVideo.getBoundingClientRect();
    const camOffsetX = camRect.left - containerRect.left;
    const camOffsetY = camRect.top - containerRect.top;
    const camDisplayW = camRect.width;
    const camDisplayH = camRect.height;
    const camVideoW = cameraVideo.videoWidth;
    const camVideoH = cameraVideo.videoHeight;
    const camVideoAspect = camVideoW / camVideoH;
    const camDisplayAspect = camDisplayW / camDisplayH;
    let sx = 0,
      sy = 0,
      sWidth = camVideoW,
      sHeight = camVideoH;
    if (camVideoAspect > camDisplayAspect) {
      sWidth = camVideoH * camDisplayAspect;
      sx = (camVideoW - sWidth) / 2;
    } else {
      sHeight = camVideoW / camDisplayAspect;
      sy = (camVideoH - sHeight) / 2;
    }
    ctx.drawImage(cameraVideo, sx, sy, sWidth, sHeight, camOffsetX, camOffsetY, camDisplayW, camDisplayH);

    // ----------------------------------------
    // B. 오버레이 영상 (object-contain 방식, 왼쪽 정렬)
    // ----------------------------------------
    let destX: number, destY: number, destW: number, destH: number;
    if (orientation === 'landscape') {
      // landscape: 오버레이 영역은 컨테이너의 80%
      destW = containerWidth * 0.8;
      destH = containerHeight * 0.8;
      destX = 0;
      destY = containerHeight - destH;
    } else {
      // portrait: 오버레이 영역은 부모 컨테이너의 전체 너비로, height는 영상 원본 비율에 맞춤
      destW = containerWidth;
      const ovAspect = overlayVideo.videoWidth / overlayVideo.videoHeight;
      destH = destW / ovAspect;
      destX = 0;
      destY = containerHeight - destH;
    }
    // object-contain 방식: 원본 전체가 보이도록 축소 (비율 유지)
    const ovVideoW = overlayVideo.videoWidth;
    const ovVideoH = overlayVideo.videoHeight;
    const scale = Math.min(destW / ovVideoW, destH / ovVideoH);
    const drawnW = ovVideoW * scale;
    const drawnH = ovVideoH * scale;
    // 왼쪽 정렬: offsetX = destX (중앙 정렬 대신)
    const offsetX = destX;
    const offsetY = destY + (destH - drawnH) / 2;
    ctx.drawImage(overlayVideo, 0, 0, ovVideoW, ovVideoH, offsetX, offsetY, drawnW, drawnH);

    // ----------------------------------------
    // C. 최종 Blob 생성
    // ----------------------------------------
    canvas.toBlob((blob) => {
      if (blob) {
        setFoto(blob);
      }
    }, 'image/png');
  };

  // orientation 업데이트
  useEffect(() => {
    const updateOrientation = () => {
      setOrientation(window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
    };
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);
    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
    };
  }, []);

  // foto -> url
  useEffect(() => {
    if (foto) {
      const reader = new FileReader();
      reader.onload = () => {
        setFotoUrl(reader.result as string);
      };
      reader.readAsDataURL(foto);
    }
  }, [foto]);

  // 애니메이션 영상(anim video)이 끝났을 때 크로스페이드
  const handleAnimVideoEnded = () => {
    setIsCrossfade(true);
    idleVideoRef.current?.play().catch((err) => console.error('Idle video play error:', err));
  };

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  return (
    <div className="relative w-dwv h-dvh flex flex-col justify-center items-center">
      <Modal isOpen={modalIsOpen} onRequestClose={closeModal} style={customStyles} contentLabel="사진확인">
        <div className="w-full h-full max-w-dvw max-h-dvh flex flex-col gap-y-2 p-2">
          <div className="flex-1 rounded-sm overflow-y-scroll">
            {fotoUrl && <img className="flex-1 object-contain w-full" src={fotoUrl} alt="captured" />}
          </div>
          <div className="w-full flex gap-x-2 font-semibold">
            <button className="flex-1 rounded-[8px] p-2 border border-[#344173] text-[#344173]" onClick={closeModal}>
              다시찍기
            </button>
            <button className="flex-1 rounded-[8px] p-2 text-white bg-[#344173]" onClick={closeSaveModal}>
              저장하기
            </button>
          </div>
        </div>
      </Modal>
      {/* 부모 컨테이너에 relative -> 오버레이 absolute */}
      <div className="relative w-full h-full max-w-dvw max-h-dvh">
        {/* 카메라 영상 */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          controls={false}
          className="absolute inset-0 w-full h-full object-cover bg-black"
        />
        {/* 오버레이: STYLE_MODE와 object-contain object-left 추가 */}
        {dimensions.width > 0 && dimensions.height > 0 && (
          <>
            <video
              ref={animVideoRef}
              playsInline
              muted
              autoPlay
              preload="auto"
              controls={false}
              crossOrigin="anonymous"
              className={'pointer-events-none object-contain object-left ' + STYLE_MODE[orientation]}
              style={{ opacity: isCrossfade ? 0 : 1 }}
              onEnded={handleAnimVideoEnded}
              onLoadedMetadata={() => {
                if (animVideoRef.current && char === 'cat') {
                  animVideoRef.current.currentTime = 0;
                }
              }}
              onSeeked={() => {
                animVideoRef.current?.play().catch((err) => console.error('Error playing anim video after seek:', err));
              }}
            >
              <source
                src={isIOS ? `/${char}_anim.mp4` : `/${char}_anim.webm`}
                type={isIOS ? 'video/mp4' : 'video/webm'}
              />
            </video>
            <video
              ref={idleVideoRef}
              playsInline
              muted
              autoPlay
              preload="auto"
              controls={false}
              loop
              crossOrigin="anonymous"
              className={'pointer-events-none object-contain object-left ' + STYLE_MODE[orientation]}
              style={{ opacity: isCrossfade ? 1 : 0 }}
            >
              <source
                src={isIOS ? `/${char}_idle.mp4` : `/${char}_idle.webm`}
                type={isIOS ? 'video/mp4' : 'video/webm'}
              />
            </video>
          </>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {!modalIsOpen && (
        <>
          <button className="fixed bottom-16 left-4 bg-transparent p-4 z-50" onClick={() => window.history.back()}>
            <Back />
          </button>
          <button
            className="fixed bottom-12 left-1/2 transform -translate-x-1/2 bg-transparent p-4 z-50"
            onClick={openModal}
          >
            <Capture />
          </button>
        </>
      )}
    </div>
  );
};

export default FrameApp;
