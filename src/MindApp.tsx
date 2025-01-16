import {ARView, ARAnchor} from './libs/react-three-mind.js';

function Plane() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 0.1]} />
      <meshStandardMaterial color="orange" />
    </mesh>
  );
}

function MindApp() {
  return (
    // @ts-ignore
    <ARView
      imageTargets="/targets.mind"
      filterMinCF={1}
      filterBeta={10000}
      missTolerance={0}
      warmupTolerance={0}
    >
      <ambientLight />
      <pointLight position={[10, 10, 10]} />
      {/* @ts-ignore */}
      <ARAnchor target={0}>
        <Plane />
      </ARAnchor>
    </ARView>
  );
}

export default MindApp;
