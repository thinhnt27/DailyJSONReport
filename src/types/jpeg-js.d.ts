declare module 'jpeg-js' {
  export interface ImageData {
    width: number;
    height: number;
    data: Buffer;
  }

  export interface DecodeOptions {
    useTArray?: boolean;
    formatAsRGBA?: boolean;
    tolerantDecoding?: boolean;
    maxResolutionInMP?: number;
    maxMemoryUsageInMB?: number;
    colorTransform?: boolean;
  }

  export interface EncodeOptions {
    quality?: number;
  }

  export function decode(jpegData: Buffer, options?: DecodeOptions): ImageData;
  export function encode(imageData: ImageData, quality?: number): { data: Buffer; width: number; height: number };
  export function encode(imageData: ImageData, options?: EncodeOptions): { data: Buffer; width: number; height: number };
}
