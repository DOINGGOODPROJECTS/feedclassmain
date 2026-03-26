"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QrCanvas({
  value,
  size = 220,
  className = "",
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) {
      return;
    }

    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
    }).catch((error) => {
      console.error("Failed to render QR code", error);
    });
  }, [size, value]);

  return <canvas ref={canvasRef} className={className} />;
}
