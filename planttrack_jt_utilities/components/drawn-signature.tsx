"use client";

import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange?: (image: string) => void;
  readOnly?: boolean;
};

/** Touch, stylus and mouse signature. Saved as a compact PNG, never a typed-name substitute. */
export default function DrawnSignature({ value, onChange, readOnly = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const strokeRef = useRef(false);
  const currentValueRef = useRef(value);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || currentValueRef.current === value && strokeRef.current) return;
    currentValueRef.current = value;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!value?.startsWith("data:image/png;base64,")) return;
    const image = new Image();
    image.onload = () => {
      if (currentValueRef.current === value) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = value;
  }, [value]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * canvas.width / bounds.width,
             y: (event.clientY - bounds.top) * canvas.height / bounds.height };
  };
  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || !onChange) return;
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.strokeStyle = "#16283f";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    drawingRef.current = true;
    strokeRef.current = true;
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const image = event.currentTarget.toDataURL("image/png");
    currentValueRef.current = image;
    onChange?.(image);
  };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    currentValueRef.current = "";
    strokeRef.current = false;
    onChange?.("");
  };

  return <div style={{width:"100%",maxWidth:520}}>
    <canvas ref={canvasRef} width={600} height={165}
      aria-label={readOnly ? "Recorded handwritten inspector signature" : "Draw your inspector signature here"}
      onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      style={{width:"100%",height:"auto",display:"block",background:"#fff",border:"1.5px solid #8a9aaf",borderRadius:7,touchAction:"none",cursor:readOnly?"default":"crosshair"}} />
    {!readOnly && <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginTop:7}}>
      <small style={{color:"#526477"}}>Sign inside the box with your finger, stylus or mouse.</small>
      <button type="button" className="secondary" onClick={clear} style={{minWidth:90}}>Clear</button>
    </div>}
  </div>;
}
