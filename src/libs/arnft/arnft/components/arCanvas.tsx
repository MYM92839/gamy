/* eslint-disable indent */
/* eslint-disable react/jsx-indent */
/* eslint-disable react/jsx-pascal-case */

import { Canvas } from '@react-three/fiber';
import { PropsWithChildren, memo, useRef } from 'react';
import * as THREE from 'three';
import { ARNftProvider } from '../arnftContext';

function ARCanvas({ arEnabled = true, interpolationFactor = 1, children, gl, ...props }: PropsWithChildren<any>) {
  const ref = useRef<any>();
  // const qrBoxEl = useRef<any>();

  return (
    <>
      {arEnabled && (
        <>
          <video
            id="ar-video"
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              top: 0,
              left: 0,
              objectFit: 'cover',
              marginLeft: 'auto'
            }}
            ref={ref}
            loop
            autoPlay
            muted
            playsInline
          />
          {/* <div ref={qrBoxEl} className="qr-box">
            <img src={'qr-frame.svg'} alt="Qr Frame" width={256} height={256} className="qr-frame" />
          </div> */}
        </>
      )}
      <Canvas
        id="three-canvas"
        camera={arEnabled ? { position: [0, 0, 0], near: 100, far: 100000 } : props.camera}
        {...props}
        gl={{
          alpha: true,
          antialias: true,
          precision: 'lowp',
          logarithmicDepthBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          ...gl
        }}
      >
        <ARNftProvider video={ref} interpolationFactor={interpolationFactor} arEnabled={arEnabled}>
          {children}
        </ARNftProvider>
      </Canvas>
    </>
  );
}

export default memo(ARCanvas);
