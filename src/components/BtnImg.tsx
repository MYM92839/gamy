interface IBtnImgProps {
  title: string;
  src: string;
  isActive: boolean
}
export default function BtnImg({ src, title, isActive }: IBtnImgProps) {
  return (
    <div className="relative pt-[17px] px-[12px] pb-0 curosor-pointer w-full h-full rounded-[20px] bg-white drop-shadow-sm text-[#344173]">
      <img className={`w-full h-full object-contain ${isActive ? 'opacity-100' : 'opacity-60'}`} src={src} />
      {title && <div className="bottom-0 leading-[34px] text-center font-semibold text-[16px] w-full">{title}</div>}
    </div>)
}