"use client";

import { useState, useEffect } from "react";
import { formatRelativeTime, formatDate } from "@/lib/time-utils";

interface RelativeTimeProps {
  date: string;
  className?: string;
}

export function RelativeTime({ date, className = "" }: RelativeTimeProps) {
  const [display, setDisplay] = useState(formatDate(date)); // Start with static date
  
  useEffect(() => {
    // Update to relative time on client
    setDisplay(formatRelativeTime(date));
    
    // Update every minute
    const interval = setInterval(() => {
      setDisplay(formatRelativeTime(date));
    }, 60000);
    
    return () => clearInterval(interval);
  }, [date]);
  
  return (
    <span className={className} title={formatDate(date)}>
      {display}
    </span>
  );
}

