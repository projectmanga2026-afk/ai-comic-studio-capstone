# 🎨 AI Comic Studio — Capstone Project

> A full-stack AI-powered platform for generating manga-style comic panels with consistent multi-character identity, built as a Software Engineering Capstone project at Ostim Technical University.

---

## 📖 Overview

AI Comic Studio is a web application that allows users to create multi-panel manga/comic pages using generative AI. Users can define characters with reference photos, describe scenes in natural language, and the system automatically generates stylized comic panels while maintaining consistent character appearance across panels.

### Key Features

- **Character Management** — Upload reference photos and define reusable characters
- **AI Panel Generation** — Generate manga-style panels using Stable Diffusion with ControlNet & IP-Adapter
- **Multi-Character Support** — Maintain identity fidelity for up to 2 characters per panel
- **Speech Bubble Editor** — Add and style comic speech bubbles with drag-and-drop positioning
- **Comic Assembly** — Arrange panels into full comic pages using a canvas editor
- **Google Colab Integration** — Cloud-based AI backend for users without a local GPU

---

## 🏗️ Architecture

```
ai-comic-studio-capstone/
├── frontend/          # Next.js 14 + TypeScript web application
│   ├── app/           # Next.js App Router pages
│   ├── components/    # UI components (Character, Panel, Assembly, Text)
│   ├── store/         # Zustand global state management
│   └── types/         # TypeScript type definitions
│
├── backend/           # FastAPI Python backend
│   ├── routers/       # API route handlers
│   ├── services/      # Business logic (ComfyUI client, generation, storage)
│   ├── workflows/     # ComfyUI JSON workflows (FLUX, InstantID)
│   └── requirements.txt
│
└── colab/             # Google Colab notebook generators for cloud GPU backend
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Konva.js |
| State Management | Zustand |
| Backend | FastAPI (Python) |
| Database | SQLite via SQLAlchemy |
| AI Generation | ComfyUI, Stable Diffusion, FLUX |
| Identity Control | IP-Adapter, InstantID, ControlNet |
| Cloud Backend | Google Colab (T4 GPU) |

---

## 🚀 Getting Started

See [USER_GUIDE.md](./USER_GUIDE.md) for full setup and usage instructions.

### Quick Start

**1. Clone the repository**
```bash
git clone https://github.com/projectmanga2026-afk/ai-comic-studio-capstone.git
cd ai-comic-studio-capstone
```

**2. Start the backend**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**3. Start the frontend**
```bash
cd frontend
npm install
npm run dev
```

**4. Open the app**

Navigate to [http://localhost:3000](http://localhost:3000)

> ⚠️ A running ComfyUI instance (local or via Google Colab) is required for AI panel generation.

---

## 📄 License

This project was developed for academic purposes as part of a Software Engineering Capstone at Ostim Technical University.
