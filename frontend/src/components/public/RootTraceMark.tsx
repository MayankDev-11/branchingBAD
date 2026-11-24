import React from 'react';

export const RootTraceMark: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="1" y="1" width="26" height="26" rx="7" fill="#FFFFFF" stroke="#E2DFD7" strokeWidth="1.2" />
    <path d="M5 19H23" stroke="#2A574B" strokeWidth="2" strokeLinecap="round" />
    <path d="M11 19C12.8 19 13.5 11.5 18.5 10" stroke="#2A574B" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="11" cy="19" r="2.2" fill="#C77724" />
    <circle cx="19.5" cy="9.8" r="2.4" fill="#2A574B" />
  </svg>
);
