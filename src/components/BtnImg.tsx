interface IBtnImgProps {
  title: string;
  src: string;
  isActive: boolean
}
export default function BtnImg({ src, title, isActive }: IBtnImgProps) {
  return (
    <div className="relative pt-[17px] px-[24px] pb-[39px] curosor-pointer w-full h-full rounded-[20px] bg-white drop-shadow-sm text-[#344173]">
      <img className={`w-full h-full object-contain ${isActive ? 'opacity-100' : 'opacity-60'}`} src={src} />
      <div className="bottom-0 leading-[34px] text-center font-semibold text-[16px] w-full">{title}</div>
    </div>)
}