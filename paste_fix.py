import re
with open("src/components/Capture.tsx", "r") as f:
    text = f.read()

# Add paste handler in the first useEffect or a global one
paste_handler = """  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onloadend = () => {
              setImage(reader.result as string);
              // Automatically process the image (like scan and OCR)
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);
"""

# find useEffect
idx = text.find("useEffect(() => {")
# let's just insert it right after the useState definitions

search_str = "const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false);"
replace_str = search_str + "\n\n" + paste_handler

if search_str in text and "document.addEventListener('paste'" not in text:
    text = text.replace(search_str, replace_str)
    
with open("src/components/Capture.tsx", "w") as f:
    f.write(text)
