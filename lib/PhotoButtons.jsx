"use client";

import { useRef } from "react";

// Clear "Take Photo" (opens the camera on mobile) + "Upload" (library/files)
// buttons backed by hidden file inputs. Calls onFiles(File[]) with whatever was
// picked. Resets the input each time so the same photo can be retaken.
export default function PhotoButtons({ onFiles }) {
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);

  function handle(e) {
    const files = Array.from(e.target.files || []);
    if (files.length) onFiles(files);
    e.target.value = "";
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        className="flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Take Photo
      </button>
      <button
        type="button"
        onClick={() => libraryRef.current?.click()}
        className="flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 text-slate-700 dark:text-slate-300 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700/60"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Upload
      </button>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
      <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={handle} />
    </div>
  );
}
