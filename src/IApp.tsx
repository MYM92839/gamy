import { useEffect, useState } from 'react';

export default function IApp() {
  const [init, setInit] = useState(false);
  useEffect(() => {
    const IFRAME_ID = 'my-iframe'; // Iframe containing AR content.
    const onLoad = () => {
      (window as any).XRIFrame.registerXRIFrame(IFRAME_ID);
      setInit(true);
    };
    // Add event listenters and callbacks for the body DOM.
    window.addEventListener('load', onLoad, false);
  }, []);

  return init ? (
    <div className="w-screen h-screen">
      <iframe
        id="my-iframe"
        allow="camera;microphone;gyroscope;accelerometer;"
        src="https://mymkim.8thwall.app/button/"
        width="100%"
      />
    </div>
  ) : null;
}
