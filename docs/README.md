# @aid-on/vad

## 概要

`@aid-on/vad`は、Silero VAD（Voice Activity Detection）をブラウザで使用するためのラッパーライブラリです。音声アクティビティ検出とノイズ除去機能を組み合わせて、高品質なリアルタイム音声処理を提供します。

## 主な特徴

- **Silero VAD統合**: 最先端の音声アクティビティ検出
- **RNNoise統合**: 深層学習ベースのノイズ除去
- **ブラウザ最適化**: WebAssembly/ONNXランタイムによる高速処理
- **リアルタイム処理**: マイクからのライブ音声対応
- **型安全性**: TypeScriptによる完全な型サポート
- **低レイテンシ**: 音声通話に適した低遅延設計

## アーキテクチャ

### 音声処理パイプライン

```
Microphone → VAD Detection → Noise Removal → Output
     ↓              ↓               ↓           ↓
  Audio Input → Silero VAD → RNNoise → Clean Audio
```

### コンポーネント構成

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Audio Input   │    │   Processing    │    │    Output       │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ Microphone      │───►│ VAD Detection   │───►│ Speech Segments │
│ File Upload     │    │ Noise Removal   │    │ Clean Audio     │
│ Stream          │    │ Volume Control  │    │ Events          │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## APIリファレンス

### 基本的な使用方法

```typescript
import { createVAD, VADOptions } from '@aid-on/vad';

// VAD初期化
const vad = await createVAD({
  modelPath: '/path/to/silero-vad.onnx',
  noiseSuppressionEnabled: true,
  sensitivity: 0.5
});

// マイクからの音声検出開始
await vad.start({
  onVoiceStart: () => console.log('音声開始'),
  onVoiceEnd: () => console.log('音声終了'),
  onVoiceSegment: (audioData) => console.log('音声セグメント', audioData)
});

// 停止
vad.stop();
```

### 高度な設定

```typescript
import { createVAD, VADOptions, NoiseSuppressionOptions } from '@aid-on/vad';

const vadOptions: VADOptions = {
  // VAD設定
  modelPath: '/models/silero-vad-v4.onnx',
  sensitivity: 0.6,          // 0.0-1.0、高いほど敏感
  minSpeechDuration: 250,    // 最小音声継続時間（ms）
  maxSilenceDuration: 500,   // 最大無音時間（ms）
  
  // ノイズ除去設定
  noiseSuppressionEnabled: true,
  noiseSuppressionOptions: {
    modelPath: '/models/rnnoise.wasm',
    aggressiveness: 0.8      // 0.0-1.0、高いほど強力
  },
  
  // オーディオ設定
  sampleRate: 16000,         // サンプリングレート
  frameSize: 512,            // フレームサイズ
  
  // パフォーマンス設定
  useWebWorker: true,        // Web Worker使用
  maxConcurrentDetections: 4  // 最大同時検出数
};

const vad = await createVAD(vadOptions);
```

## 使用例

### リアルタイム音声録音

```typescript
// src/voice-recorder.ts
import { createVAD } from '@aid-on/vad';

export class VoiceRecorder {
  private vad: any;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private mediaRecorder?: MediaRecorder;

  async initialize() {
    this.vad = await createVAD({
      modelPath: '/models/silero-vad.onnx',
      sensitivity: 0.7,
      noiseSuppressionEnabled: true,
      minSpeechDuration: 300,
      maxSilenceDuration: 800
    });

    // マイクアクセス取得
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: false  // VADで処理するため無効
      }
    });

    this.setupMediaRecorder(stream);
    this.setupVADEvents();
  }

  private setupMediaRecorder(stream: MediaStream) {
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.processRecording();
    };
  }

  private setupVADEvents() {
    this.vad.start({
      onVoiceStart: () => {
        console.log('🎤 音声検出開始');
        this.startRecording();
      },
      
      onVoiceEnd: () => {
        console.log('🔇 音声検出終了');
        this.stopRecording();
      },
      
      onVoiceSegment: (audioData: Float32Array) => {
        // リアルタイム音声レベル表示
        const volume = this.calculateVolume(audioData);
        this.updateVolumeIndicator(volume);
      },
      
      onNoiseLevel: (level: number) => {
        // 環境ノイズレベル監視
        this.updateNoiseIndicator(level);
      }
    });
  }

  private startRecording() {
    if (!this.isRecording && this.mediaRecorder) {
      this.audioChunks = [];
      this.mediaRecorder.start(100); // 100ms間隔でデータ取得
      this.isRecording = true;
      
      // UIフィードバック
      document.getElementById('recording-indicator')?.classList.add('active');
    }
  }

  private stopRecording() {
    if (this.isRecording && this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      
      // UIフィードバック
      document.getElementById('recording-indicator')?.classList.remove('active');
    }
  }

  private async processRecording() {
    if (this.audioChunks.length > 0) {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      
      // 録音完了イベント発火
      this.onRecordingComplete?.(audioBlob);
      
      // 音声ファイル保存（オプション）
      await this.saveRecording(audioBlob);
    }
  }

  private calculateVolume(audioData: Float32Array): number {
    let sum = 0;
    for (const sample of audioData) {
      sum += sample * sample;
    }
    return Math.sqrt(sum / audioData.length);
  }

  private updateVolumeIndicator(volume: number) {
    const indicator = document.getElementById('volume-indicator') as HTMLProgressElement;
    if (indicator) {
      indicator.value = volume * 100;
    }
  }

  private updateNoiseIndicator(noiseLevel: number) {
    const indicator = document.getElementById('noise-indicator');
    if (indicator) {
      indicator.textContent = `ノイズレベル: ${Math.round(noiseLevel * 100)}%`;
    }
  }

  async destroy() {
    this.vad?.stop();
    this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
  }

  // コールバック設定
  onRecordingComplete?: (audioBlob: Blob) => void;
}

// 使用例
const recorder = new VoiceRecorder();
await recorder.initialize();

recorder.onRecordingComplete = async (audioBlob) => {
  console.log('録音完了:', audioBlob.size, 'bytes');
  
  // 音声認識などの後続処理
  await processAudioBlob(audioBlob);
};
```

### ライブ音声チャット

```typescript
// src/voice-chat.ts
import { createVAD } from '@aid-on/vad';

export class VoiceChatSystem {
  private vad: any;
  private webSocket?: WebSocket;
  private audioContext?: AudioContext;
  private isConnected = false;

  async initialize(websocketUrl: string) {
    // VAD初期化
    this.vad = await createVAD({
      modelPath: '/models/silero-vad.onnx',
      sensitivity: 0.8,  // チャット用に高感度
      minSpeechDuration: 200,  // レスポンシブ性重視
      maxSilenceDuration: 300,
      noiseSuppressionEnabled: true,
      noiseSuppressionOptions: {
        aggressiveness: 0.9  // チャット用に強力なノイズ除去
      }
    });

    // WebSocket接続
    await this.connectWebSocket(websocketUrl);
    
    // オーディオコンテキスト初期化
    this.audioContext = new AudioContext({ sampleRate: 16000 });
  }

  private async connectWebSocket(url: string) {
    return new Promise((resolve, reject) => {
      this.webSocket = new WebSocket(url);
      
      this.webSocket.onopen = () => {
        console.log('💬 音声チャットに接続しました');
        this.isConnected = true;
        this.setupVADForChat();
        resolve(void 0);
      };
      
      this.webSocket.onmessage = (event) => {
        this.handleIncomingAudio(event.data);
      };
      
      this.webSocket.onclose = () => {
        console.log('💬 音声チャットから切断しました');
        this.isConnected = false;
      };
      
      this.webSocket.onerror = (error) => {
        console.error('WebSocket エラー:', error);
        reject(error);
      };
    });
  }

  private setupVADForChat() {
    this.vad.start({
      onVoiceStart: () => {
        // 音声送信開始をサーバーに通知
        this.sendMessage({
          type: 'voice_start',
          timestamp: Date.now()
        });
        
        // UI更新
        this.updateSpeakingIndicator(true);
      },
      
      onVoiceEnd: () => {
        // 音声送信終了をサーバーに通知
        this.sendMessage({
          type: 'voice_end',
          timestamp: Date.now()
        });
        
        // UI更新
        this.updateSpeakingIndicator(false);
      },
      
      onVoiceSegment: (audioData: Float32Array) => {
        // リアルタイム音声データをサーバーに送信
        this.sendAudioData(audioData);
      }
    });
  }

  private sendAudioData(audioData: Float32Array) {
    if (this.webSocket && this.isConnected) {
      // 音声データを圧縮してバイナリ送信
      const compressed = this.compressAudioData(audioData);
      this.webSocket.send(compressed);
    }
  }

  private sendMessage(message: any) {
    if (this.webSocket && this.isConnected) {
      this.webSocket.send(JSON.stringify(message));
    }
  }

  private compressAudioData(audioData: Float32Array): ArrayBuffer {
    // 音声データの圧縮（実装例：16bit PCMに変換）
    const compressed = new Int16Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      compressed[i] = Math.max(-32768, Math.min(32767, audioData[i] * 32767));
    }
    return compressed.buffer;
  }

  private async handleIncomingAudio(data: ArrayBuffer) {
    if (!this.audioContext) return;

    try {
      // 受信音声データをデコード・再生
      const audioBuffer = await this.audioContext.decodeAudioData(data);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start();
      
      // 発話者表示更新
      this.updateRemoteSpeakingIndicator(true);
      
      // 音声終了タイマー
      setTimeout(() => {
        this.updateRemoteSpeakingIndicator(false);
      }, audioBuffer.duration * 1000);
      
    } catch (error) {
      console.error('音声再生エラー:', error);
    }
  }

  private updateSpeakingIndicator(speaking: boolean) {
    const indicator = document.getElementById('local-speaking');
    if (indicator) {
      indicator.classList.toggle('active', speaking);
      indicator.textContent = speaking ? '🎤 発話中' : '🔇 待機中';
    }
  }

  private updateRemoteSpeakingIndicator(speaking: boolean) {
    const indicator = document.getElementById('remote-speaking');
    if (indicator) {
      indicator.classList.toggle('active', speaking);
      indicator.textContent = speaking ? '🔊 相手が話しています' : '';
    }
  }

  // 音声品質調整
  adjustSensitivity(sensitivity: number) {
    this.vad.updateSettings({ sensitivity });
  }

  adjustNoiseReduction(level: number) {
    this.vad.updateNoiseReduction({ aggressiveness: level });
  }

  // 接続終了
  disconnect() {
    this.vad?.stop();
    this.webSocket?.close();
    this.audioContext?.close();
  }
}
```

### 音声コマンド検出

```typescript
// src/voice-command-detector.ts
import { createVAD } from '@aid-on/vad';

export class VoiceCommandDetector {
  private vad: any;
  private commandBuffer: Float32Array[] = [];
  private isListening = false;
  private commandTimeoutId?: NodeJS.Timeout;

  async initialize() {
    this.vad = await createVAD({
      modelPath: '/models/silero-vad.onnx',
      sensitivity: 0.9,  // コマンド検出用高感度
      minSpeechDuration: 150,
      maxSilenceDuration: 200,
      noiseSuppressionEnabled: true
    });
  }

  async startListening() {
    if (this.isListening) return;
    
    this.isListening = true;
    
    await this.vad.start({
      onVoiceStart: () => {
        console.log('🎯 コマンド検出開始');
        this.commandBuffer = [];
        this.showCommandIndicator(true);
        
        // タイムアウト設定（5秒）
        this.commandTimeoutId = setTimeout(() => {
          this.cancelCommand();
        }, 5000);
      },
      
      onVoiceSegment: (audioData: Float32Array) => {
        // コマンド音声をバッファに蓄積
        this.commandBuffer.push(new Float32Array(audioData));
        
        // リアルタイム音量表示
        const volume = this.calculateVolume(audioData);
        this.updateCommandProgress(volume);
      },
      
      onVoiceEnd: () => {
        console.log('🎯 コマンド検出終了');
        this.processCommand();
        this.showCommandIndicator(false);
        
        if (this.commandTimeoutId) {
          clearTimeout(this.commandTimeoutId);
        }
      }
    });
  }

  private async processCommand() {
    if (this.commandBuffer.length === 0) return;
    
    // バッファされた音声データを結合
    const totalLength = this.commandBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
    const combinedAudio = new Float32Array(totalLength);
    
    let offset = 0;
    for (const chunk of this.commandBuffer) {
      combinedAudio.set(chunk, offset);
      offset += chunk.length;
    }
    
    // 音声をBlobに変換
    const audioBlob = this.audioFloatArrayToBlob(combinedAudio);
    
    // コマンド認識実行
    try {
      this.showProcessingIndicator(true);
      const command = await this.recognizeCommand(audioBlob);
      
      if (command) {
        await this.executeCommand(command);
      } else {
        this.showCommandError('コマンドを認識できませんでした');
      }
      
    } catch (error) {
      console.error('コマンド処理エラー:', error);
      this.showCommandError('コマンド処理中にエラーが発生しました');
      
    } finally {
      this.showProcessingIndicator(false);
      this.commandBuffer = [];
    }
  }

  private async recognizeCommand(audioBlob: Blob): Promise<string | null> {
    // STT APIに送信（@aid-on/unisttpなどを使用）
    const formData = new FormData();
    formData.append('audio', audioBlob);
    
    const response = await fetch('/api/voice-command/recognize', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    return result.command || null;
  }

  private async executeCommand(command: string) {
    const commands = {
      'ライトオン': () => this.controlLight(true),
      'ライトオフ': () => this.controlLight(false),
      '音量アップ': () => this.adjustVolume(1),
      '音量ダウン': () => this.adjustVolume(-1),
      'プレイ': () => this.controlMusic('play'),
      'ストップ': () => this.controlMusic('stop'),
      '天気教えて': () => this.getWeather(),
      '時間教えて': () => this.getCurrentTime()
    };

    const executor = commands[command] || (() => {
      this.showCommandError(`未知のコマンド: ${command}`);
    });

    try {
      await executor();
      this.showCommandSuccess(`コマンド「${command}」を実行しました`);
    } catch (error) {
      this.showCommandError(`コマンド実行エラー: ${error.message}`);
    }
  }

  private calculateVolume(audioData: Float32Array): number {
    let sum = 0;
    for (const sample of audioData) {
      sum += sample * sample;
    }
    return Math.sqrt(sum / audioData.length);
  }

  private audioFloatArrayToBlob(audioData: Float32Array): Blob {
    // Float32ArrayをWAVファイルに変換
    const buffer = new ArrayBuffer(44 + audioData.length * 2);
    const view = new DataView(buffer);
    
    // WAVヘッダー作成
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + audioData.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, audioData.length * 2, true);
    
    // オーディオデータ
    let offset = 44;
    for (const sample of audioData) {
      const s = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  // UI表示メソッド
  private showCommandIndicator(show: boolean) {
    const indicator = document.getElementById('command-indicator');
    if (indicator) {
      indicator.style.display = show ? 'block' : 'none';
    }
  }

  private updateCommandProgress(volume: number) {
    const progress = document.getElementById('command-progress') as HTMLProgressElement;
    if (progress) {
      progress.value = Math.min(volume * 10, 1);
    }
  }

  private showProcessingIndicator(show: boolean) {
    const indicator = document.getElementById('processing-indicator');
    if (indicator) {
      indicator.style.display = show ? 'block' : 'none';
    }
  }

  private showCommandSuccess(message: string) {
    this.showNotification(message, 'success');
  }

  private showCommandError(message: string) {
    this.showNotification(message, 'error');
  }

  private showNotification(message: string, type: 'success' | 'error') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 3000);
  }

  private cancelCommand() {
    console.log('コマンドタイムアウト');
    this.showCommandIndicator(false);
    this.showCommandError('コマンドがタイムアウトしました');
    this.commandBuffer = [];
  }

  // コマンド実行メソッド（スタブ）
  private async controlLight(on: boolean) {
    console.log(`💡 ライト${on ? 'オン' : 'オフ'}`);
  }

  private async adjustVolume(delta: number) {
    console.log(`🔊 音量調整: ${delta > 0 ? '+' : ''}${delta}`);
  }

  private async controlMusic(action: string) {
    console.log(`🎵 音楽${action}`);
  }

  private async getWeather() {
    console.log('🌤️ 天気情報を取得中...');
  }

  private async getCurrentTime() {
    const time = new Date().toLocaleTimeString('ja-JP');
    console.log(`🕒 現在時刻: ${time}`);
  }

  stopListening() {
    this.isListening = false;
    this.vad?.stop();
    if (this.commandTimeoutId) {
      clearTimeout(this.commandTimeoutId);
    }
  }
}
```

## 設定オプション

### VAD詳細設定

```typescript
interface VADOptions {
  // モデル設定
  modelPath: string;
  modelUrl?: string;  // CDN等からの動的読み込み
  
  // 検出感度
  sensitivity: number;          // 0.0-1.0
  minSpeechDuration: number;    // ms
  maxSilenceDuration: number;   // ms
  
  // オーディオ設定
  sampleRate: number;           // Hz
  frameSize: number;            // samples
  hopLength?: number;           // samples
  
  // ノイズ除去
  noiseSuppressionEnabled: boolean;
  noiseSuppressionOptions?: NoiseSuppressionOptions;
  
  // パフォーマンス
  useWebWorker: boolean;
  maxConcurrentDetections: number;
  bufferSize?: number;          // samples
  
  // デバッグ
  debug?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

interface NoiseSuppressionOptions {
  modelPath: string;
  aggressiveness: number;       // 0.0-1.0
  frameSize?: number;
  hopLength?: number;
}
```

## パフォーマンス考慮事項

### ブラウザ最適化

```typescript
// Web Worker使用による最適化
class OptimizedVADProcessor {
  private worker?: Worker;
  private audioBuffer: Float32Array[] = [];
  
  async initializeWorker() {
    this.worker = new Worker('/workers/vad-worker.js');
    
    this.worker.onmessage = (event) => {
      const { type, data } = event.data;
      
      switch (type) {
        case 'voiceDetected':
          this.handleVoiceDetected(data);
          break;
        case 'processingComplete':
          this.handleProcessingComplete(data);
          break;
      }
    };
  }
  
  processAudioChunk(audioData: Float32Array) {
    // バッファリングによる効率化
    this.audioBuffer.push(audioData);
    
    if (this.audioBuffer.length >= 10) {
      // 一括処理でオーバーヘッド削減
      this.worker?.postMessage({
        type: 'processBatch',
        data: this.audioBuffer
      });
      
      this.audioBuffer = [];
    }
  }
}
```

### メモリ管理

```typescript
// メモリ効率的な音声処理
class MemoryEfficientVAD {
  private audioRingBuffer: Float32Array;
  private bufferIndex = 0;
  private readonly bufferSize = 16384; // 1秒分 @ 16kHz
  
  constructor() {
    this.audioRingBuffer = new Float32Array(this.bufferSize);
  }
  
  addAudioData(audioData: Float32Array) {
    for (const sample of audioData) {
      this.audioRingBuffer[this.bufferIndex] = sample;
      this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;
    }
  }
  
  getRecentAudio(durationMs: number): Float32Array {
    const sampleCount = Math.floor((durationMs / 1000) * 16000);
    const result = new Float32Array(sampleCount);
    
    let sourceIndex = (this.bufferIndex - sampleCount + this.bufferSize) % this.bufferSize;
    
    for (let i = 0; i < sampleCount; i++) {
      result[i] = this.audioRingBuffer[sourceIndex];
      sourceIndex = (sourceIndex + 1) % this.bufferSize;
    }
    
    return result;
  }
}
```