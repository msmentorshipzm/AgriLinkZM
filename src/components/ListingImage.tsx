import React, { useState } from 'react';
import { Sprout } from 'lucide-react';

interface ListingImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export const ListingImage: React.FC<ListingImageProps> = ({
  src,
  alt,
  className = 'h-full w-full object-cover',
  fallbackLabel,
}) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#EEF3EC] px-4 text-center text-[#1B5E20] ${className}`}
        role="img"
        aria-label={alt}
      >
        <Sprout className="h-8 w-8 opacity-75" />
        <span className="mt-2 line-clamp-2 text-xs font-medium text-[#374151]">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
