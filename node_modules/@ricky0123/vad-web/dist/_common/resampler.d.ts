interface ResamplerOptions {
    nativeSampleRate: number;
    targetSampleRate: number;
    targetFrameSize: number;
}
export declare class Resampler {
    options: ResamplerOptions;
    inputBuffer: Array<number>;
    constructor(options: ResamplerOptions);
    process: (audioFrame: Float32Array) => Float32Array[];
    stream: (audioFrame: Float32Array) => AsyncGenerator<any, void, unknown>;
    private fillInputBuffer;
    private hasEnoughDataForFrame;
    private generateOutputFrame;
}
export {};
//# sourceMappingURL=resampler.d.ts.map