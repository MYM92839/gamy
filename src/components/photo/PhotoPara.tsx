import { PropsWithChildren } from "react";

interface IPhotoParaProps extends PropsWithChildren {
  title: string;
}
export default function PhotoPara({ title, children }: IPhotoParaProps) {
  return (
    <div className="absolute inset-0 px-[24px]">
      <img className="mt-[60px] mx-auto" src={import.meta.env.VITE_PUBLIC_URL + "/imgs/title.png"} />
      <div className="mt-[57px] font-semibold text-[#EBF0E8] text-[16px] mx-auto text-center whitespace-pre-wrap">{title}</div>
      <div className="mt-[125px] w-full text-center leading-[25px] text-[16px] font-medium py-[11px] rounded-[20px] border border-white bg-black/30 backdrop-blur-sm text-white">
        카메라 사용을 허용해야<br />
        AR 사진 촬영이 가능합니다.</div>
      {children}
    </div>
  )
}