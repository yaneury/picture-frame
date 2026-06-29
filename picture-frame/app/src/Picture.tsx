import { useState, useEffect, useRef } from "react";

// @ts-ignore
import libheif from 'libheif-js/wasm-bundle';
import { BaseDirectory, readBinaryFile } from "@tauri-apps/api/fs";

import { ResourceLocation } from "./models";

import "./Picture.css";

enum Orientation {
  Pending,
  Landscape,
  Portrait
}

interface Props {
  location: ResourceLocation;
}

const Picture = ({ location }: Props) => {

  return (
    <>
      {location.type === "url" && <Img url={location.url} />}
      {location.type !== "url" && <Canvas path={location.path} base={location.base} />}
    </>
  )
}

const Img = ({ url }: { url: string }) => {
  const [orientation, setOrientation] = useState<Orientation>(Orientation.Pending);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = imgRef.current;

    if (img) {
      img.onload = () => {
        const isLandscape = img.naturalWidth > img.naturalHeight;
        setOrientation(isLandscape ? Orientation.Landscape : Orientation.Portrait);
      };

      img.src = url;
    }
  }, [url]);

  return (
    <img ref={imgRef} src={url} className={orientationToClass(orientation)} />
  );
}

const Canvas = ({ path, base }: { path: string, base: BaseDirectory }) => {
  const [orientation, setOrientation] = useState<Orientation>(Orientation.Pending);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const loadPicture = async () => {
      const imageAsBytes = await fetchFileAsArray(path, base);
      const decoder = new libheif.HeifDecoder();
      const decodedImage = decoder.decode(imageAsBytes);

      const image = decodedImage[0];
      const width = image.get_width();
      const height = image.get_height();

      const isLandscape = width > height;
      setOrientation(isLandscape ? Orientation.Landscape : Orientation.Portrait);

      canvasRef.current!.width = width;
      canvasRef.current!.height = height;

      const context = canvasRef.current!.getContext('2d');
      const imageData = context!.createImageData(width, height)!;
      await new Promise<void>((resolve, reject) => {
        image.display(imageData, (displayData: any) => {
          if (!displayData) {
            return reject(new Error('HEIF processing error'));
          }

          resolve();
        });
      });

      context!.putImageData(imageData, 0, 0);
    }

    loadPicture();
  });

  return (
    <canvas ref={canvasRef} className={orientationToClass(orientation)} />
  )
}

const fetchFileAsArray = async (path: string, base: BaseDirectory): Promise<Uint8Array> => {
  try {
    return await readBinaryFile(path, { dir: base });
  } catch (error) {
    throw Error(`Failed to download ${path}: ${error}`);
  }
}

const orientationToClass = (orientation: Orientation): string => {
  switch (orientation) {
    case Orientation.Pending:
      return "img-display-none"
    case Orientation.Portrait:
      return "img-display-portrait"
    case Orientation.Landscape:
      return "img-display-landscape"
  }
}


export default Picture;
