/* eslint-disable camelcase */
import { Camera } from '@react-three/fiber';
import * as THREE from 'three';
import { isMobile, setMatrix } from './utils';

const workerScript = '/js/arnft.worker.js';

export class ARNft {
  inputWidth: any;
  inputHeight: any;
  cameraParamUrl: string;
  video: { videoWidth: any; videoHeight: any };
  renderer: THREE.WebGLRenderer;
  camera: Camera & { manual?: boolean | undefined };
  onLoaded: (msg: any) => void;
  markers: any[];
  initialCameraPosition: any;
  canvasProcess: HTMLCanvasElement;
  contextProcess: any;
  markerTracked: boolean = false;
  worker: Worker;
  pw: any;
  ph: any;
  w!: number;
  h!: number;
  ox!: number;
  oy!: number;
  onOriginDetected: any;
  constructor(
    cameraParamUrl: string,
    video: { videoWidth: any; videoHeight: any },
    renderer: THREE.WebGLRenderer,
    camera: Camera & { manual?: boolean | undefined },
    onLoaded: (msg: any) => void,
    interpolationFactor: any
  ) {
    this.inputWidth = video.videoWidth;
    this.inputHeight = video.videoHeight;

    this.cameraParamUrl = cameraParamUrl;
    this.video = video;
    this.renderer = renderer;
    this.camera = camera;
    this.onLoaded = onLoaded;

    this.camera.matrixAutoUpdate = false;

    this.markers = [];

    this.canvasProcess = document.createElement('canvas');
    this.contextProcess = this.canvasProcess.getContext('2d', { willReadFrequently: true });

    this.initRenderer();

    this.worker = new Worker(workerScript);
    this.worker.onmessage = (e: any) => this.onWorkerMessage(e);
    this.worker.postMessage({
      type: 'load',
      pw: this.pw,
      ph: this.ph,
      cameraParamUrl: this.cameraParamUrl,
      interpolationFactor,
    });
    this.onOriginDetected = null; // ✅ onOriginDetected를 기본적으로 null로 설정
  }

  initRenderer() {
    const pScale = 320 / Math.max(this.inputWidth, (this.inputHeight / 3) * 4);
    const sScale = isMobile() ? window.outerWidth / this.inputWidth : 1;

    const sw = this.inputWidth * sScale;
    const sh = this.inputHeight * sScale;

    this.w = this.inputWidth * pScale;
    this.h = this.inputHeight * pScale;

    this.pw = Math.max(this.w, (this.h / 3) * 4);
    this.ph = Math.max(this.h, (this.w / 4) * 3);

    this.ox = (this.pw - this.w) / 2;
    this.oy = (this.ph - this.h) / 2;

    (this.canvasProcess.style as any).clientWidth = this.pw + 'px';
    (this.canvasProcess.style as any).clientHeight = this.ph + 'px';
    this.canvasProcess.width = this.pw;
    this.canvasProcess.height = this.ph;

    console.log('processCanvas:', this.canvasProcess.width, this.canvasProcess.height);

    this.renderer.setSize(sw, sh, false); // false -> do not update css styles
  }

  loadMarkers(markers: any[]) {
    markers.forEach((marker: { root: { matrixAutoUpdate: boolean } }) => (marker.root.matrixAutoUpdate = false));

    this.markers = markers;
    this.worker.postMessage({
      type: 'loadMarkers',
      markers: markers.map((marker: { url: any }) => marker.url),
    });
  }

  process() {
    this.contextProcess.fillStyle = 'black';
    this.contextProcess.fillRect(0, 0, this.pw, this.ph);
    this.contextProcess.drawImage(
      this.video,
      0,
      0,
      this.inputWidth,
      this.inputHeight,
      this.ox,
      this.oy,
      this.w,
      this.h
    );

    const imageData = this.contextProcess.getImageData(0, 0, this.pw, this.ph);
    this.worker.postMessage({ type: 'process', imagedata: imageData }, [imageData.data.buffer]);
  }

  onWorkerMessage(e: { data: any }) {
    const msg = e.data;
    switch (msg.type) {
      case 'loaded': {
        const proj = JSON.parse(msg.proj);
        const ratioW = this.pw / this.w;
        const ratioH = this.ph / this.h;
        const f = 2000.0;
        const n = 0.1;

        proj[0] *= ratioW;
        proj[5] *= ratioH;
        proj[10] = -(f / (f - n));
        proj[14] = -((f * n) / (f - n));

        setMatrix(this.camera.projectionMatrix, proj);

        this.onLoaded(msg);
        break;
      }
      case 'markersLoaded': {
        if (msg.end === true) {
          console.log(msg);
        }
        this.process();
        break;
      }
      case 'markerInfos': {
        this.onMarkerInfos(msg.markers);
        break;
      }
      case 'found': {
        // console.log('found', msg);
        this.onFound(msg);
        break;
      }
      case 'lost': {
        //   console.log('lost', msg);
        this.onLost();
        break;
      }
      case 'processNext': {
        this.process();
        break;
      }
    }
  }

  onMarkerInfos(markerInfos: any[]) {
    console.log('markerInfos', markerInfos, this.markers);
    markerInfos.forEach((markerInfo: { id: string | number; width: number; dpi: number; height: number }) => {
      this.markers[markerInfo.id as any].root.children[0].position.x =
        ((markerInfo.width / markerInfo.dpi) * 2.54 * 10) / 2.0;
      this.markers[markerInfo.id as any].root.children[0].position.y =
        ((markerInfo.height / markerInfo.dpi) * 2.54 * 10) / 2.0;
    });
  }

  onFound(msg: { matrixGL_RH: string; index: string }) {
    if (this.markerTracked) return; // ✅ 이미 감지되었다면 실행 안 함

    console.log('FOUND');
    const matrix = JSON.parse(msg.matrixGL_RH);
    const index = JSON.parse(msg.index);

    // ✅ 마커의 행렬 설정
    setMatrix(this.markers[index].root.matrix, matrix);
    this.markers[index].root.matrixAutoUpdate = false; // ✅ 자동 행렬 업데이트 비활성화 (중요)

    // ✅ 마커의 월드 위치를 `matrixGL_RH`에서 직접 가져오기 (원점으로 설정)
    const markerPosition = new THREE.Vector3(matrix[12], matrix[13], matrix[14]);
    console.log('✅ 마커 감지됨, 원점 위치 설정:', markerPosition);

    // ✅ 최초 감지 시 카메라 위치 저장 (이후 `useFrame`에서 별도 관리 불필요)
    if (!this.initialCameraPosition) {
      this.initialCameraPosition = new THREE.Vector3();

      if (this.renderer.xr.isPresenting) {
        // WebXR 모드에서는 camera.matrixWorld에서 가져오기
        this.initialCameraPosition.setFromMatrixPosition(this.camera.matrixWorld);
      } else {
        // 일반 모드에서는 getWorldPosition() 사용
        this.camera.getWorldPosition(this.initialCameraPosition);
      }
      console.log('✅ 최초 감지된 카메라 위치 저장:', this.initialCameraPosition);
    }

    // ✅ 현재 카메라 위치 가져오기
    const currentCameraPosition = new THREE.Vector3();
    if (this.renderer.xr.isPresenting) {
      currentCameraPosition.setFromMatrixPosition(this.camera.matrixWorld);
    } else {
      this.camera.getWorldPosition(currentCameraPosition);
    }
    console.log('✅ 현재 카메라 위치:', currentCameraPosition);

    // ✅ 마커(원점) 기준으로 카메라 위치 보정
    const adjustedCameraPosition = new THREE.Vector3().subVectors(currentCameraPosition, this.initialCameraPosition);
    console.log('✅ 보정된 카메라 위치:', adjustedCameraPosition);

    // ✅ `onOriginDetected()` 호출하여 원점 설정 (최초 한 번만)
    if (!this.markerTracked && typeof this.onOriginDetected === 'function') {
      this.onOriginDetected(markerPosition); // ✅ 마커 좌표를 원점으로 유지
      this.markerTracked = true;
    }
  }

onLost() {
    console.log("❌ 마커 손실됨!");

    // ✅ 마커 가시성 제거
    this.markers.forEach((marker) => (marker.root.visible = false));

    // ✅ 마커 재감지를 위해 `markerTracked` 초기화
    this.markerTracked = false;

    // ✅ 카메라 위치 다시 초기화하여 보정값 유지
    this.initialCameraPosition = null;
}


}
