import { PropsWithChildren } from 'react';
import { useARNft, useNftMarker } from '../arnftContext';

const NFTMarker = ({ children, url }: PropsWithChildren<any>) => {
  const { arEnabled } = useARNft();
  const ref = useNftMarker(url);

  return (
    <group ref={ref} visible={!arEnabled}>
      <group name="center">{children}</group>
    </group>
  );
};

export default NFTMarker;
