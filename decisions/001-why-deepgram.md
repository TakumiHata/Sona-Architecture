# ADR 001: 音声認識エンジンにDeepgramを採用する理由

## Status
Accepted

## Context
個人開発において、高精度な日本語音声認識とリアルタイム性が必要。
選択肢として以下を検討した。
1. **Google Cloud STT V2 (Chirp)**: 精度は高いがコストが高く、個人開発の月額予算を圧迫する懸念がある。
2. **OpenAI Whisper (Local)**: GPUリソースが必要で、サーバー維持費がかかる。また環境構築が複雑。
3. **Deepgram (Nova-2)**: 高速かつ安価。

## Decision
**Deepgram (Nova-2)** を採用する。

## Consequences
- **Positive**: コストがGoogleの約1/5以下に抑えられる。処理速度が非常に速い。
- **Negative**: gRPCネイティブではないため、Pythonサーバー側でWebSocketへのプロキシ実装が必要（Gatewayパターンの採用）。