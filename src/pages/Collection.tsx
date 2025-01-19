import Cookies from "js-cookie";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import BtnImg from "../components/BtnImg";

export default function Collection() {
  const [searchParams] = useSearchParams();
  const scannedResult = searchParams.get('wonju'); // test
  const [{ one, two, three, four }, setQ] = useState({ one: false, two: false, three: false, four: false })


  useEffect(() => {
    // QR 코드 데이터가 변경, 확인된 경우
    if (scannedResult) {
      const cookieStr = Cookies.get('WonjuPlaces');

      if (scannedResult.indexOf('wonju') > -1) {
        const num = scannedResult.replace('wonju_00', '');
        const date = new Date();
        const expires = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
        const cookieOpt = { expires: expires, domain: '.wonju.go.kr', path: '/' };

        if (cookieStr) {
          if (cookieStr.includes(num)) {
            // cancelAnimationFrame(tickfunc);
            Cookies.set('WonjuPopup', 'already', cookieOpt);
            // window.location.href = `https://wonju.go.kr`;
            // return;
          } else {
            // cancelAnimationFrame(tickfunc);
            Cookies.remove('WonjuPlaces', cookieOpt);
            Cookies.set('WonjuPlaces', cookieStr + num + '', cookieOpt);
            Cookies.set('WonjuPopup', num + '', cookieOpt);
            // window.location.href = `https://wonju.go.kr`;
            //return;
          }
        } else {
          Cookies.set('WonjuPlaces', num, cookieOpt);
          Cookies.set('WonjuPopup', num + '', cookieOpt);
          // window.location.href = `https://wonju.go.kr`;
          // return;
        }
      } else {
        alert('유효하지 않은 QR 코드입니다.');
      }
    }

    const cookieStr = Cookies.get('WonjuPlaces');
    if (cookieStr) {
      const res = { one: false, two: false, three: false, four: false }

      const spl = cookieStr.split('')
      res.one = spl.includes('1')
      res.two = spl.includes('2')
      res.three = spl.includes('3')
      res.four = spl.includes('4')
      setQ({ ...res })
    }
  }, [scannedResult]);


  const handleDownload = (): void => {
    const url = '/relic.png'
    const link = document.createElement("a");
    link.download = `camera-frame-${new Date().getTime()}.png`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);

  };

  return (
    <div className="w-full h-full  min-h-[874px] relative">
      <img className="absolute top-0 w-full" src="/top_image.png" />
      <div className="absolute inset-0 px-[24px]">
        <img className="mt-[60px] mx-auto" src="/title.png" />
        <div className="mt-[109px] font-semibold text-[#EBF0E8] text-[16px] mx-auto text-center">수집하신 유물을 볼 수 있어요</div>

        <div className="w-full gap-[20px] aspect-square grid grid-cols-2 grid-rows-2 mt-[20px]">
          <BtnImg title="유물 1" src="/relic.png" isActive={one} />
          <BtnImg title="유물 2" src="/relic.png" isActive={two} />
          <BtnImg title="유물 3" src="/relic.png" isActive={three} />
          <BtnImg title="유물 4" src="/relic.png" isActive={four} />
        </div>

        {one && two && three && four && <div className="w-full mt-[28px] z-10 flex relative items-center justify-center">
          <button className="" onClick={handleDownload}>
            <svg width="190" height="61" viewBox="0 0 190 61" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g filter="url(#filter0_bd_104_127)">
                <path d="M5 25.5C5 11.4167 16.4167 0 30.5 0H159.5C173.583 0 185 11.4167 185 25.5C185 39.5833 173.583 51 159.5 51H30.5C16.4167 51 5 39.5833 5 25.5Z" fill="white" fillOpacity="0.85" shapeRendering="crispEdges" />
                <path d="M6.5 25.5C6.5 12.2452 17.2452 1.5 30.5 1.5H159.5C172.755 1.5 183.5 12.2452 183.5 25.5C183.5 38.7548 172.755 49.5 159.5 49.5H30.5C17.2452 49.5 6.5 38.7548 6.5 25.5Z" stroke="white" strokeWidth="3" shapeRendering="crispEdges" />
              </g>
              <path d="M75.7305 23.625H78.3477V25.6562H75.7305V34.8359H73.2305V17.0234H75.7305V23.625ZM70.75 20.6758H64.8906V28.4688C66.2904 28.4557 67.5404 28.4069 68.6406 28.3223C69.7409 28.2376 70.8477 28.0977 71.9609 27.9023L72.2344 29.9922C71.043 30.194 69.8678 30.334 68.709 30.4121C67.5566 30.4837 66.2318 30.5195 64.7344 30.5195H63.9141H62.4102V18.6641H70.75V20.6758ZM94.7422 27.668H88.0039V30.7539H85.4844V27.668H78.4727V25.6758H94.7422V27.668ZM92.9453 34.4844H80.4062V29.1719H82.9258V32.4727H92.9453V34.4844ZM86.5977 17.3555C87.8737 17.362 88.9935 17.5182 89.957 17.8242C90.9271 18.1237 91.679 18.5501 92.2129 19.1035C92.7467 19.6569 93.0169 20.3047 93.0234 21.0469C93.0169 21.7956 92.7467 22.4466 92.2129 23C91.679 23.5534 90.9271 23.9798 89.957 24.2793C88.9935 24.5723 87.8737 24.7188 86.5977 24.7188C85.3151 24.7188 84.1855 24.5723 83.209 24.2793C82.2389 23.9798 81.487 23.5534 80.9531 23C80.4193 22.4466 80.1523 21.7956 80.1523 21.0469C80.1523 20.3047 80.4193 19.6569 80.9531 19.1035C81.487 18.5501 82.2389 18.1237 83.209 17.8242C84.1855 17.5182 85.3151 17.362 86.5977 17.3555ZM86.5977 19.3281C85.4193 19.3281 84.498 19.4779 83.834 19.7773C83.1699 20.0703 82.8411 20.4935 82.8477 21.0469C82.8411 21.5872 83.1699 22.0039 83.834 22.2969C84.5046 22.5833 85.4258 22.7266 86.5977 22.7266C87.7565 22.7266 88.6712 22.5833 89.3418 22.2969C90.0124 22.0039 90.3477 21.5872 90.3477 21.0469C90.3477 20.4935 90.0124 20.0703 89.3418 19.7773C88.6777 19.4779 87.763 19.3281 86.5977 19.3281ZM111.547 32.8242H95.2773V30.7734H102.133V28.0977H97.1523V22.1211H107.211V20.168H97.1328V18.1758H109.672V24.0742H99.6523V26.0664H110.082V28.0977H104.613V30.7734H111.547V32.8242ZM126.555 27.2383H113.977V18.5078H126.418V20.5195H116.438V25.2461H126.555V27.2383ZM128.332 32.6289H112.062V30.5781H128.332V32.6289Z" fill="#344173" />
              <defs>
                <filter id="filter0_bd_104_127" x="-10" y="-15" width="210" height="81" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  <feFlood floodOpacity="0" result="BackgroundImageFix" />
                  <feGaussianBlur in="BackgroundImageFix" stdDeviation="7.5" />
                  <feComposite in2="SourceAlpha" operator="in" result="effect1_backgroundBlur_104_127" />
                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                  <feOffset dy="5" />
                  <feGaussianBlur stdDeviation="2.5" />
                  <feComposite in2="hardAlpha" operator="out" />
                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
                  <feBlend mode="normal" in2="effect1_backgroundBlur_104_127" result="effect2_dropShadow_104_127" />
                  <feBlend mode="normal" in="SourceGraphic" in2="effect2_dropShadow_104_127" result="shape" />
                </filter>
              </defs>
            </svg>
          </button>
        </div>}


      </div>
      <img className="absolute bottom-0 w-full" src="/bottom_image.png" />
    </div>)
}