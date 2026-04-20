with open("src/App.tsx", "r") as f:
    text = f.read()

old_footer = """        <footer className="w-full text-center py-4 px-6 mt-auto border-t border-[#E5E5E0] dark:border-zinc-800">
          <p className="text-[10px] text-[#8E8E8E] dark:text-zinc-500 opacity-70">
            {t('This app is powered by Gemini, AI is not always reliable and can make mistakes')}
          </p>
        </footer>"""

new_footer = """        <footer className="w-full text-center py-4 px-6 mt-auto border-t border-[#E5E5E0] dark:border-zinc-800">
          <p className="text-[10px] text-[#8E8E8E] dark:text-zinc-500 opacity-70">
            {t('This app is powered by Gemini, AI is not always reliable and can make mistakes')}
          </p>
          <button 
            onClick={() => showModal({
              type: 'alert',
              title: 'Copyright Notice',
              message: 'This software is provided for personal and private use only.\\n\\nYou may:\\n- Use, modify, and run the software for personal purposes\\n\\nYou may NOT:\\n- Sell, sublicense, or commercially distribute this software\\n- Offer this software as a hosted or paid service\\n- Use this software in any commercial context\\n\\nFor commercial licensing, contact the author.'
            })}
            className="text-[10px] text-[#8E8E8E] dark:text-zinc-500 opacity-70 mt-1 hover:underline hover:opacity-100 transition-opacity"
          >
            &copy; 2026 IlmDaftar
          </button>
        </footer>"""

text = text.replace(old_footer, new_footer)

with open("src/App.tsx", "w") as f:
    f.write(text)
