const IFRAME_ID = 'my-iframe'; // Iframe containing AR content.
const onLoad = () => {
  (window as any).XRIFrame.registerXRIFrame(IFRAME_ID);
};
// Add event listenters and callbacks for the body DOM.
window.addEventListener('load', onLoad, false);
export default function IApp() {
  return (
    <div className="w-screen h-screen">
      <iframe
        id="my-iframe"
        allow="camera;microphone;gyroscope;accelerometer;"
        src="https://mymkim.8thwall.app/button/"
        width="100%"
      />
    </div>
  );
}
