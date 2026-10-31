'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { processImageToWebp, ProcessedImageResult } from '@/lib/images/profile-images';
import { Upload, ZoomIn, ZoomOut, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';

export interface ImageCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'avatar' | 'banner';
  initialFile?: File | null;
  onCropComplete: (result: ProcessedImageResult) => void;
}

export const ImageCropDialog: React.FC<ImageCropDialogProps> = ({
  open,
  onOpenChange,
  type,
  initialFile,
  onCropComplete,
}) => {
  const [file, setFile] = React.useState<File | null>(initialFile || null);
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState<number>(1);
  const [pan, setPan] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  React.useEffect(() => {
    if (initialFile) {
      setFile(initialFile);
    }
  }, [initialFile]);

  React.useEffect(() => {
    if (!file) {
      setImageSrc(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setError(null);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const handleFileSelect = (selectedFile: File) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!validTypes.includes(selectedFile.type)) {
      setError('Please upload a valid image file (PNG, JPEG, WebP, or GIF).');
      return;
    }
    setFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageSrc) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleConfirmCrop = async () => {
    if (!file || !imgRef.current) return;
    setIsProcessing(true);
    setError(null);

    try {
      const isAvatar = type === 'avatar';
      const result = await processImageToWebp(file, {
        maxWidth: isAvatar ? 512 : 1200,
        maxHeight: isAvatar ? 512 : 400,
        aspectRatio: isAvatar ? 1 : 3,
        maxSizeBytes: isAvatar ? 2 * 1024 * 1024 : 3 * 1024 * 1024,
      });

      onCropComplete(result);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to process image');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6 bg-card border-border rounded-2xl shadow-dialog">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground">
            {type === 'avatar' ? 'Crop Profile Avatar' : 'Crop Profile Banner'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {!imageSrc ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border hover:border-primary/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-surface-default hover:bg-surface-hover"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                Click to browse or drag and drop image
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPEG, WebP, or GIF (max {type === 'avatar' ? '2 MB' : '3 MB'} processed)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Interactive Crop Viewport */}
              <div
                className={`relative overflow-hidden bg-black/80 rounded-2xl select-none cursor-grab active:cursor-grabbing flex items-center justify-center ${
                  type === 'avatar' ? 'h-64' : 'h-48'
                }`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {/* Image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Crop preview"
                  draggable={false}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                  }}
                  className="max-h-full max-w-full object-contain pointer-events-none"
                />

                {/* Mask Overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  {type === 'avatar' ? (
                    <div className="w-44 h-44 rounded-full border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]" />
                  ) : (
                    <div className="w-full h-32 border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]" />
                  )}
                </div>
              </div>

              {/* Zoom & Reset Controls */}
              <div className="flex items-center gap-3 px-2">
                <ZoomOut className="w-4 h-4 text-muted-foreground shrink-0" />
                <Slider
                  min={1}
                  max={3}
                  step={0.05}
                  value={[zoom]}
                  onValueChange={(val) => setZoom(val[0])}
                  className="flex-1"
                />
                <ZoomIn className="w-4 h-4 text-muted-foreground shrink-0" />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  title="Reset alignment"
                  className="h-8 px-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-danger/10 text-danger text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="text-xs"
          >
            Cancel
          </Button>
          {imageSrc && (
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirmCrop}
              disabled={isProcessing}
              className="text-xs gap-1.5"
            >
              {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Apply & Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

