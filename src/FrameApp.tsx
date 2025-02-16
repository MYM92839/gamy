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

// 오버레이를 absolute로 배치하도록 수정
const STYLE_MODE: { [key: string]: string } = {
  landscape: 'absolute left-0 bottom-0 w-[80%] h-[80%] max-w-dvw max-h-dvh',
  portrait: 'absolute left-0 bottom-0 w-full h-auto max-w-dvw max-h-dvh',
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
    const element = document.documentElement; // 또는 전체 앱의 최상위 요소
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if ((element as any).webkitRequestFullscreen) {
      // Safari 대응
      (element as any).webkitRequestFullscreen();
    } else if ((element as any).msRequestFullscreen) {
      // IE11 대응
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

      // idle, anim video도 재생 시도
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
    const animVideo = animVideoRef.current;
    const canvas = canvasRef.current;

    if (!container || !cameraVideo || !animVideo || !canvas) {
      console.warn('Required elements not ready');
      return;
    }

    // container 크기에 맞게 캔버스 설정
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = containerWidth * devicePixelRatio;
    canvas.height = containerHeight * devicePixelRatio;

    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(devicePixelRatio, devicePixelRatio);

    /** 1. 카메라 영상 캡쳐 (object-cover 효과 모방) **/
    const camVideoWidth = cameraVideo.videoWidth;
    const camVideoHeight = cameraVideo.videoHeight;
    const camAspect = camVideoWidth / camVideoHeight;
    const containerAspect = containerWidth / containerHeight;
    let camDrawWidth = containerWidth;
    let camDrawHeight = containerHeight;
    let camOffsetX = 0;
    let camOffsetY = 0;
    if (camAspect > containerAspect) {
      camDrawWidth = containerHeight * camAspect;
      camOffsetX = (containerWidth - camDrawWidth) / 2;
    } else {
      camDrawHeight = containerWidth / camAspect;
      camOffsetY = (containerHeight - camDrawHeight) / 2;
    }
    context.drawImage(cameraVideo, camOffsetX, camOffsetY, camDrawWidth, camDrawHeight);

    /** 2. Overlay (애니메이션) 영상 캡쳐 – orientation에 따라 계산 **/
    // DOM에서 오버레이의 실제 위치/크기 읽어오기
    const animRect = animVideo.getBoundingClientRect();
    let animOffsetX = animRect.left - containerRect.left;
    let animOffsetY = animRect.top - containerRect.top;
    let animDisplayWidth = animRect.width;
    let animDisplayHeight = animRect.height;

    // landscape 시 80% 크기 강제 (원하시는 경우 유지)
    if (orientation === 'landscape') {
      animDisplayWidth = containerWidth * 0.8;
      animDisplayHeight = containerHeight * 0.8;
      animOffsetX = 0;
      animOffsetY = containerHeight - animDisplayHeight;
    }

    // overlay 영상 원본 크기 및 비율
    const animVideoWidth = animVideo.videoWidth;
    const animVideoHeight = animVideo.videoHeight;
    const animVideoAspect = animVideoWidth / animVideoHeight;
    const animDisplayAspect = animDisplayWidth / animDisplayHeight;

    // object-fit: cover와 유사하게, 원본 영상에서 잘라낼 영역 계산
    let sx = 0,
      sy = 0,
      sWidth = animVideoWidth,
      sHeight = animVideoHeight;
    if (animVideoAspect > animDisplayAspect) {
      // 영상이 더 넓은 경우 좌우 크롭
      sWidth = animVideoHeight * animDisplayAspect;
      sx = (animVideoWidth - sWidth) / 2;
    } else {
      // 영상이 더 높은 경우 상하 크롭
      sHeight = animVideoWidth / animDisplayAspect;
      sy = (animVideoHeight - sHeight) / 2;
    }
    context.drawImage(
      animVideo,
      sx,
      sy,
      sWidth,
      sHeight,
      animOffsetX,
      animOffsetY,
      animDisplayWidth,
      animDisplayHeight
    );

    // Blob 생성 (저장 혹은 공유 처리)
    canvas.toBlob((blob) => {
      if (blob) {
        setFoto(blob);
      }
    }, 'image/png');
  };

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

  useEffect(() => {
    if (foto) {
      const reader = new FileReader();
      reader.onload = () => {
        setFotoUrl(reader.result as string);
      };
      reader.readAsDataURL(foto);
    }
  }, [foto]);

  // 애니메이션 영상(anim video)이 끝났을 때 크로스페이드 시작
  const handleAnimVideoEnded = () => {
    setIsCrossfade(true);
    idleVideoRef.current?.play().catch((err) => console.error('Idle video play error:', err));
  };

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  return (
    <div className="relative w-dwv h-dvh flex flex-col justify-center items-center">
      {!init && !isIOS && (
        <button className="fixed z-50 p-4 bg-transparent top-4 right-4" onClick={requestFullScreen}>
          전체화면
        </button>
      )}
      <Modal isOpen={modalIsOpen} onRequestClose={closeModal} style={customStyles} contentLabel="사진확인">
        <div className="w-full h-full max-w-dvw max-h-dvh flex flex-col gap-y-2 p-2">
          <div className="flex-1 rounded-sm overflow-y-scroll">
            {fotoUrl && <img className="flex-1 object-contain" src={fotoUrl} alt="captured" />}
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

      {/* 부모 컨테이너에 relative 적용 -> 오버레이도 absolute로 배치 가능 */}
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

        {/* 애니메이션 영상 (anim video) */}
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
              // 여기서 'absolute'로 변경
              className={'pointer-events-none ' + STYLE_MODE[orientation]}
              style={{ opacity: isCrossfade ? 0 : 1 }}
              onEnded={handleAnimVideoEnded}
              onLoadedMetadata={() => {
                if (animVideoRef.current && char === 'cat') {
                  // 예: 영상 시작 시간을 0.1초로 설정
                  animVideoRef.current.currentTime = 0.1;
                }
              }}
              onSeeked={() => {
                animVideoRef.current?.play().catch((err) => console.error('Error playing anim video after seek:', err));
              }}
            >
              <source
                src={isIOS ? `/${char}_anim.mp4` : `/${char}_anim.webm`}
                type={isIOS ? 'video/mp4' : 'video/webm'}
                onError={(e) => {
                  console.error('Anim video error:', e);
                }}
              />
            </video>

            {/* idle 영상 (preload="auto", loop) */}
            <video
              ref={idleVideoRef}
              playsInline
              muted
              autoPlay
              preload="auto"
              controls={false}
              loop
              crossOrigin="anonymous"
              className={'pointer-events-none ' + STYLE_MODE[orientation]}
              style={{ opacity: isCrossfade ? 1 : 0 }}
            >
              <source
                src={isIOS ? `/${char}_idle.mp4` : `/${char}_idle.webm`}
                type={isIOS ? 'video/mp4' : 'video/webm'}
                onError={(e) => {
                  console.error('Idle video error:', e);
                }}
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
