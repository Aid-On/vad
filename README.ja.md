# @aid-on/vad

<div align="center">

[![npm version](https://img.shields.io/npm/v/@aid-on/vad.svg?style=flat-square&color=00DC82)](https://www.npmjs.com/package/@aid-on/vad)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

<br />

<h3>
<b>vad</b> - ノイズ抑制機能付きブラウザ音声アクティビティ検出
</h3>

<p align="center">
<b>ユーザーがいつ話しているかを検知。</b><br/>
リアルタイムブラウザ音声アプリケーションのために設計された、RNNoiseノイズ抑制内蔵のSilero VAD。
</p>

<br/>

**日本語** | [**English**](./README.md)

<br/>

</div>

## なぜ@aid-on/vadなのか？

音声駆動のブラウザアプリケーションを構築するには、2つの難しい問題を解決する必要があります。ユーザーが実際に話しているタイミングの検出と、処理前のバックグラウンドノイズの除去です。このパッケージは両方を解決します。

- **Silero VAD** - ONNX Runtimeによる最先端の音声検出モデル
- **RNNoiseノイズ抑制** - WebAssemblyを使用したオプションのノイズ低減パイプライン
- **シンプルなコールバックAPI** - `onSpeechStart`, `onSpeechEnd`, `onFrameProcessed`, `onVADMisfire`
- **WAV変換** - キャプチャした音声をSTT APIに送信するための組み込み`audioToWav()`
- **CDNバージョン自動管理** - テスト済みのvad-webとONNX Runtimeのバージョンを固定してCDNから読み込み
- **設定不要** - 合理的なデフォルト値、5行のコードで音声検出を開始

## インストール

```bash
npm install @aid-on/vad
```

**注意:** このパッケージはブラウザ専用です。WebAssemblyサポートと`navigator.mediaDevices.getUserMedia`へのアクセスが必要です。

## クイックスタート

```typescript
import { createVAD } from "@aid-on/vad";

const vad = await createVAD({
  onSpeechStart: () => {
    console.log("ユーザーが話し始めました");
  },
  onSpeechEnd: (audio) => {
    // audioは16kHzのFloat32Array
    console.log(`${audio.length}サンプルをキャプチャ`);
  },
});

vad.start();
```

## APIリファレンス

### `createVAD(callbacks, config?)`

新しいVADインスタンスを作成します。マイクへのアクセスを要求し、Silero VADモデルを読み込み、オプションでRNNoiseノイズ抑制パイプラインをセットアップします。

```typescript
import { createVAD } from "@aid-on/vad";

const vad = await createVAD(
  {
    onSpeechStart: () => {
      // ユーザーが話し始めた
      updateUI("listening");
    },
    onSpeechEnd: (audio: Float32Array) => {
      // ユーザーが話し終わった
      // audioには16kHzモノラルのキャプチャ済み音声が含まれる
      sendToSTT(audio);
    },
    onFrameProcessed: (probability: number) => {
      // 各オーディオフレームで音声確率（0-1）とともに呼び出される
      updateMeter(probability);
    },
    onVADMisfire: () => {
      // 音声が短すぎた（minSpeechFrames閾値未満）
      console.log("短すぎるため無視");
    },
  },
  {
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    minSpeechFrames: 3,
    noiseSuppression: true,
  }
);
```

**戻り値:** `Promise<VADInstance>`

### VADInstance

`createVAD()`が返すオブジェクト。

| メソッド/プロパティ | 型 | 説明 |
|-------------------|------|------|
| `start()` | `() => void` | 音声検出を開始 |
| `pause()` | `() => void` | 一時停止（リソースは保持） |
| `listening` | `boolean` | VADが現在リスニング中かどうか |
| `destroy()` | `() => void` | リスニング停止、マイク解放、全リソースのクリーンアップ |

```typescript
// ライフサイクル
vad.start();              // 音声検出開始
console.log(vad.listening); // true

vad.pause();              // 一時停止
console.log(vad.listening); // false

vad.start();              // 再開

vad.destroy();            // 完全クリーンアップ（これ以降の再開は不可）
```

### `audioToWav(samples, sampleRate?)`

`Float32Array`の音声サンプルをWAV `Blob`に変換します。キャプチャした音声をSTT APIに送信する際に便利です。

```typescript
import { audioToWav } from "@aid-on/vad";

const vad = await createVAD({
  onSpeechEnd: (audio) => {
    // STT APIにアップロードするためWAVに変換
    const wavBlob = audioToWav(audio, 16000);

    const formData = new FormData();
    formData.append("file", wavBlob, "speech.wav");

    fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });
  },
});
```

**パラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|---------|------|
| `samples` | `Float32Array` | 必須 | 音声サンプルデータ（-1から1の値） |
| `sampleRate` | `number` | `16000` | サンプルレート（Hz） |

**戻り値:** MIMEタイプ`audio/wav`の`Blob`

出力は標準的なPCM WAVファイル: モノラル、16ビット、指定されたサンプルレートです。

### 設定

#### VADConfig

| オプション | 型 | デフォルト | 説明 |
|-----------|------|---------|------|
| `positiveSpeechThreshold` | `number` | `0.5` | 音声開始を検出する確率閾値（0-1） |
| `negativeSpeechThreshold` | `number` | `0.35` | 音声終了を検出する確率閾値（0-1） |
| `minSpeechFrames` | `number` | `3` | 音声としてカウントする最小フレーム数（誤検知防止） |
| `preSpeechPadFrames` | `number` | `3` | 音声開始前に含めるフレーム数 |
| `redemptionFrames` | `number` | `8` | 音声終了と判断するまでの待機フレーム数 |
| `noiseSuppression` | `boolean` | `true` | RNNoiseベースのノイズ抑制を有効化 |

#### VADCallbacks

| コールバック | 型 | 説明 |
|-------------|------|------|
| `onSpeechStart` | `() => void` | 音声が検出された時に呼び出される |
| `onSpeechEnd` | `(audio: Float32Array) => void` | 音声終了時にキャプチャ済み音声データとともに呼び出される |
| `onFrameProcessed` | `(probability: number) => void` | 各フレームで音声確率（0-1）とともに呼び出される |
| `onVADMisfire` | `() => void` | 検出された音声が短すぎた場合に呼び出される |

## 実践例: STT連携の音声チャット

```typescript
import { createVAD, audioToWav } from "@aid-on/vad";

// 音声チャットアプリケーション向けにノイズ抑制付きVADを作成
const vad = await createVAD(
  {
    onSpeechStart: () => {
      statusIndicator.textContent = "聴取中...";
      statusIndicator.classList.add("active");
    },
    onSpeechEnd: async (audio) => {
      statusIndicator.textContent = "処理中...";

      // WAVに変換してSTTに送信
      const wavBlob = audioToWav(audio, 16000);
      const formData = new FormData();
      formData.append("file", wavBlob, "speech.wav");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const { text } = await response.json();
      chatMessages.append(createMessage(text, "user"));

      statusIndicator.textContent = "準備完了";
      statusIndicator.classList.remove("active");
    },
    onFrameProcessed: (probability) => {
      // 音声確率メーターを視覚的に更新
      meterElement.style.width = `${probability * 100}%`;
    },
    onVADMisfire: () => {
      statusIndicator.textContent = "準備完了";
    },
  },
  {
    positiveSpeechThreshold: 0.6,   // ノイズの多い環境向けにやや高め
    negativeSpeechThreshold: 0.35,
    minSpeechFrames: 5,             // トリガーにより長い音声を要求
    redemptionFrames: 10,           // 切断前の待機を延長
    noiseSuppression: true,         // RNNoiseを有効化
  }
);

// ボタンで開始/停止
toggleButton.addEventListener("click", () => {
  if (vad.listening) {
    vad.pause();
    toggleButton.textContent = "開始";
  } else {
    vad.start();
    toggleButton.textContent = "停止";
  }
});

// ページ離脱時にクリーンアップ
window.addEventListener("beforeunload", () => {
  vad.destroy();
});
```

## アーキテクチャ

音声処理パイプライン:

```
マイクロフォン (48kHz)
  |
  +-- [RNNoise] (オプション、WebAssemblyノイズ抑制)
  |     48kHzで480サンプルフレーム
  |
  +-- Silero VAD (ONNX Runtime、フレームごとの音声確率)
  |
  +-- 音声セグメンテーション
        |
        +-- onSpeechStart()
        +-- onSpeechEnd(Float32Array @ 16kHz)
        +-- onVADMisfire()
```

**CDN依存関係（実行時に読み込み）:**

| パッケージ | バージョン | 用途 |
|-----------|---------|------|
| `@ricky0123/vad-web` | `0.0.18` | Silero VADモデルとワークレット |
| `onnxruntime-web` | `1.14.0` | WebAssembly推論用ONNX Runtime |
| `@shiguredo/rnnoise-wasm` | `^2025.1.5` | RNNoiseノイズ抑制（バンドル） |

## ライセンス

MIT (C) Aid-On

---

<div align="center">

**ブラウザのためのリアルタイム音声検出。大切な音声だけを聞き取る。**

<br/>

[NPM](https://www.npmjs.com/package/@aid-on/vad) •
[GitHub](https://github.com/Aid-On/aid-on-platform)

</div>
