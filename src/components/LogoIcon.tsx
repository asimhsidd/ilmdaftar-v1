import React from 'react';

export function LogoIcon({ className, style, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      {...props}
    >
      {/* Book outline (Pages spreading) */}
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H11v17.5a.5.5 0 0 0 .5.5h.5V11C12 7 15 4 19 3v16.5a.5.5 0 0 0 .5-.5H20A2.5 2.5 0 0 0 17.5 22H6.5A2.5 2.5 0 0 1 4 19.5z" opacity="0.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      
      {/* Central Feather */}
      <path d="M12 11c3-5 7-8 10-9-2 4-2 9-5 13-1 1 3-3 4-2-4 5-8 5-9 5V11z" fill="currentColor" />
      
      {/* Pen nib */}
      <path d="M10.5 20.5 L12 24 L13.5 20.5 Z" fill="currentColor" />
      <path d="M12 21v2" stroke="var(--bg-color, white)" strokeWidth="0.5" />
      <circle cx="12" cy="22" r="0.4" fill="var(--bg-color, white)" />
    </svg>
  );
}
