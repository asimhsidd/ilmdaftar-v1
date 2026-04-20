import re
with open("src/components/Capture.tsx", "r") as f:
    text = f.read()

old_paste = """          const reader = new FileReader();
          reader.onloadend = () => {
            setImage(reader.result as string);
            // Automatically process the image (like scan and OCR)
          };"""

new_paste = """          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            setImage(base64);
            processOCR(base64);
          };"""

text = text.replace(old_paste, new_paste)

# Now, implement Camera capture
# We'll need a state: const [isCameraOpen, setIsCameraOpen] = useState(false);
# And a ref: const videoRef = useRef<HTMLVideoElement>(null);
# And a function to start/stop the camera, and take a photo.

camera_state = """  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch (e) {
      await showModal({ type: 'alert', title: 'Camera Error', message: 'Failed to access camera' });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setImage(dataUrl);
        processOCR(dataUrl);
        stopCamera();
      }
    }
  };
"""

state_search = "const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false);"
if "const [isCameraOpen" not in text:
    text = text.replace(state_search, state_search + "\n" + camera_state)

# Replace onClick on 'Take Picture' div
take_picture_html_old = """onClick={() => cameraInputRef.current?.click()}
            className="border-2 border-dashed border-[#E5E5E0] dark:border-zinc-700 rounded-3xl p-12 flex flex-col items-center justify-center bg-white dark:bg-zinc-900 hover:bg-[#F5F5F0] dark:hover:bg-zinc-800 transition-all cursor-pointer group"
          >
            <div className="p-6 bg-[#F5F5F0] dark:bg-zinc-800 rounded-full mb-6 group-hover:scale-110 transition-transform">
              <Camera className="w-12 h-12 text-[#5A5A40] dark:text-zinc-400" />
            </div>
            <h3 className="text-xl font-bold mb-2 dark:text-white">{t('Take Picture')}</h3>
            <p className="text-[#8E8E8E] dark:text-gray-500 text-center">{t('Use Camera Description')}</p>
            <input 
              type="file" 
              ref={cameraInputRef} 
              className="hidden" 
              accept="image/*" 
              capture="environment"
              onChange={handleFileUpload} 
            />"""

take_picture_html_new = """onClick={startCamera}
            className="border-2 border-dashed border-[#E5E5E0] dark:border-zinc-700 rounded-3xl p-12 flex flex-col items-center justify-center bg-white dark:bg-zinc-900 hover:bg-[#F5F5F0] dark:hover:bg-zinc-800 transition-all cursor-pointer group"
          >
            <div className="p-6 bg-[#F5F5F0] dark:bg-zinc-800 rounded-full mb-6 group-hover:scale-110 transition-transform">
              <Camera className="w-12 h-12 text-[#5A5A40] dark:text-zinc-400" />
            </div>
            <h3 className="text-xl font-bold mb-2 dark:text-white">{t('Take Picture')}</h3>
            <p className="text-[#8E8E8E] dark:text-gray-500 text-center">{t('Use Camera Description')}</p>"""

if take_picture_html_old in text:
    text = text.replace(take_picture_html_old, take_picture_html_new)

# Add the UI for camera view modal
camera_modal_ui = """
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-lg bg-zinc-900 rounded-xl overflow-hidden shadow-2xl">
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              <button onClick={stopCamera} className="p-3 bg-red-600 hover:bg-red-500 text-white rounded-full transition-colors shadow-lg">
                <X className="w-6 h-6" />
              </button>
            </div>
            <video ref={videoRef} autoPlay playsInline className="w-full h-[60vh] object-cover bg-black" />
            <div className="p-6 flex justify-center bg-zinc-900">
              <button onClick={capturePhoto} className="w-20 h-20 bg-white rounded-full border-4 border-zinc-900 ring-2 ring-white hover:bg-zinc-200 transition-colors shadow-lg flex items-center justify-center">
                <Camera className="w-8 h-8 text-black" />
              </button>
            </div>
          </div>
        </div>
      )}
"""

# Place it right after the outermost <div className="space-y-6"> or similar 
# Better: Right at the end before final </div>
if "isCameraOpen &&" not in text:
    last_div_idx = text.rfind("</div>")
    text = text[:last_div_idx] + camera_modal_ui + text[last_div_idx:]


with open("src/components/Capture.tsx", "w") as f:
    f.write(text)
