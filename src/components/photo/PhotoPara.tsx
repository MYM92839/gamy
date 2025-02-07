import { PropsWithChildren } from 'react';

interface IPhotoParaProps extends PropsWithChildren {
  title: string;
}
export default function PhotoPara({ title, children }: IPhotoParaProps) {
  return (
    <div className="absolute inset-0 px-[24px] w-full h-full">
      <div className="absolute object-cover inset-0 min-h-screen w-full h-full">
        <div className="absolute w-full min-h-full bg-gradient-to-b from-[#344173] z-10" />
        <img
          className="w-full relative min-h-full object-cover "
          src={import.meta.env.VITE_PUBLIC_URL + '/background_image.png'}
        />
      </div>
      <div className='w-full min-h-screen z-20 relative pt-[60px]'>
        <img
          className="absolute left-1/2 -translate-x-1/2 z-[9999]"
          src={import.meta.env.VITE_PUBLIC_URL + '/title.png'}
        />
        <div className="mt-[125px] font-semibold text-[#EBF0E8] text-[16px] mx-auto text-center whitespace-pre-wrap">
          {title}
        </div>
        <div className="mt-[162px] w-full text-center leading-[25px] text-[16px] font-medium py-[11px] rounded-[20px] border border-white bg-black/30 backdrop-blur-sm text-white">
          카메라 사용을 허용해야
          <br />
          AR 사진 촬영이 가능합니다.
        </div>
        {children}
      </div>
    </div>
  );
}
