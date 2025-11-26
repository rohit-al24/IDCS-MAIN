import React from "react";

export function AnimatedRingLoader({ done }: { done: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center">
      {!done ? (
        <svg className="animate-spin h-16 w-16 text-primary" viewBox="0 0 50 50">
          <circle
            className="opacity-25"
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M25 5a20 20 0 0 1 0 40 20 20 0 0 1 0-40zm0 6a14 14 0 1 0 0 28 14 14 0 0 0 0-28z"
          />
        </svg>
      ) : (
        <svg className="h-20 w-20 text-green-500 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M8 12l2 2l4-4" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      )}
      <div className="mt-2 text-lg font-semibold text-primary">
        {done ? "Upload Complete!" : "Uploading..."}
      </div>
    </div>
  );
}
