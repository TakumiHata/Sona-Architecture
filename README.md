# Sona-Architecture 🏛️

**Sona-Suite**（旧称: meet-scribe）の全体設計・仕様管理リポジトリです。
ここにはソースコードは含まれません。システムの全体像、設計思想、技術選定の記録（ADR）を管理します。

## 📦 Sona-Suite Repositories

| Component | Repository Link | Tech Stack | Local Path (AI Context) |
| :--- | :--- | :--- | :--- |
| **Desktop App** | [SonaCore-Client](#) | Electron, React, gRPC | `/home/takumi/Application/SonaCore` |
| **Backend API** | [Voice-Verifier](#) | Python, Deepgram (Nova-2), gRPC | `/home/takumi/Application/voice-verifier` |
| **Dashboard** | [Sona-Web](#) | Next.js, Supabase | `/home/takumi/Application/Sona-Web` |
| **Protobuf** | [Sona-Protobuf](#) | gRPC Definitions | `/home/takumi/Application/Sona-Protobuf` |

## 📐 Architecture Overview
> **Concept**: Turning voice into gold.
> 音声を「資産」に変える。DeepgramとgRPCを駆使した、リアルタイム議事録＆マッピングエコシステム。

![System Diagram](./assets/system-diagram.png)
*(Please add system architecture diagram here)*

## 📚 Documentation
- [**System Design / 詳細設計書**](./docs/01_system-design.md)
  - システム全体のアーキテクチャ、データフロー、外部API仕様。
- [**Decision Records (ADR)**](./decisions/)
  - 技術選定の背景と理由。