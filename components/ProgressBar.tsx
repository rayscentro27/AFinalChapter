import React from 'react';

const ProgressBar = ({ progress }) => (
  <div className="w-full bg-[#E5EAF2] rounded-full h-3 mb-4">
    <div
      className="bg-[#2563EB] h-3 rounded-full transition-all"
      style={{ width: `${progress}%` }}
    />
  </div>
);

export default ProgressBar;
