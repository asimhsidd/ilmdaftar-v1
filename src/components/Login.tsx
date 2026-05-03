import React from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { LogIn } from 'lucide-react';

export default function Login() {
  const { signInWithGoogle } = useAuth();

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F5F5F7] dark:bg-black p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-2xl border border-[#E5E7EB] dark:border-zinc-800 max-w-md w-full text-center"
      >
        <img src="/logo.png" alt="IlmDaftar Logo" className="w-24 h-24 mx-auto mb-6 rounded-2xl" />
        
        <h1 className="text-3xl font-bold font-serif mb-2 text-[#18407B] dark:text-white">
          'IlmDaftar
        </h1>
        <p className="text-[#8E8E8E] dark:text-zinc-400 mb-8">
          Sign in to sync your Islamic knowledge across all your devices.
        </p>

        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 py-4 px-6 bg-white dark:bg-zinc-800 border-2 border-[#E5E7EB] dark:border-zinc-700 hover:border-[#6197EC] dark:hover:border-[#6197EC] rounded-xl font-bold text-[#1A1A1A] dark:text-white transition-all hover:shadow-lg"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
          Sign in with Google
        </button>
      </motion.div>
    </div>
  );
}
