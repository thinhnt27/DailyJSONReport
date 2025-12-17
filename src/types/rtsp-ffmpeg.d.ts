declare module 'rtsp-ffmpeg' {
  export interface RtspClientOptions {
    input: string;
    rate?: number;
    quality?: number;
    resolution?: string;
  }

  export class FFMpeg {
    constructor(options: RtspClientOptions);
    on(event: 'data', callback: (data: Buffer) => void): this;
    on(event: 'error', callback: (error: Error) => void): this;
    start(): void;
    stop(): void;
  }

  export default FFMpeg;
}
