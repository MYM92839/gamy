function Back({ style }: { style?: any }) {
  return (
    <svg style={style} width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g opacity="0.9" filter="url(#filter0_b_58_103)">
        <circle cx="24" cy="24" r="24" fill="#344173" fill-opacity="0.7" />
      </g>
      <path d="M24.6364 16L17 24M17 24L24.6364 32M17 24H32" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <defs>
        <filter id="filter0_b_58_103" x="-30" y="-30" width="108" height="108" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feGaussianBlur in="BackgroundImageFix" stdDeviation="15" />
          <feComposite in2="SourceAlpha" operator="in" result="effect1_backgroundBlur_58_103" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_backgroundBlur_58_103" result="shape" />
        </filter>
      </defs>
    </svg>

  );
}

export default Back;
