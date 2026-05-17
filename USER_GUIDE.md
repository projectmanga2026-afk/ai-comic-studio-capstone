# 📘 AI Comic Studio — User Guide

This guide explains how to set up and use the AI Comic Studio application from scratch.

---

## 📋 Prerequisites

Before running the application, make sure you have the following installed:

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.10+ | For the backend |
| Node.js | 18+ | For the frontend |
| ComfyUI | Latest | For AI image generation |
| Git | Any | To clone the repo |

> 💡 **No GPU?** You can use Google Colab as a free cloud GPU backend. See the [Colab Setup](#-google-colab-setup-no-gpu) section below.

---

## ⚙️ Installation & Setup

### Step 1 — Clone the Repository

```bash
git clone https://github.com/projectmanga2026-afk/ai-comic-studio-capstone.git
cd ai-comic-studio-capstone
```

---

### Step 2 — Backend Setup

```bash
cd backend
```

**Create a virtual environment (recommended):**
```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux
```

**Install dependencies:**
```bash
pip install -r requirements.txt
```

**Configure environment variables:**

Copy the example env file and fill in your settings:
```bash
copy .env.example .env
```

Open `.env` and set the following:
```env
COMFYUI_URL=http://127.0.0.1:8188    # URL of your running ComfyUI instance
DATABASE_URL=sqlite:///./comic_studio.db
STORAGE_DIR=../storage
```

**Start the backend server:**
```bash
uvicorn main:app --reload --port 8000
```

The API will be available at: `http://localhost:8000`

---

### Step 3 — Frontend Setup

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The app will be available at: `http://localhost:3000`

---

### Step 4 — ComfyUI Setup (Local GPU)

1. Download and install ComfyUI from [https://github.com/comfyanonymous/ComfyUI](https://github.com/comfyanonymous/ComfyUI)
2. Install the required custom nodes:
   - `ComfyUI-IPAdapter-plus`
   - `ComfyUI-InstantID`
   - `ComfyUI_essentials`
3. Place your Stable Diffusion / FLUX model checkpoints in `ComfyUI/models/checkpoints/`
4. Start ComfyUI and ensure it's running on port `8188`

---

## ☁️ Google Colab Setup (No GPU)

If you don't have a local GPU, the `colab/` folder contains notebooks that run the ComfyUI backend on a free Google Colab T4 GPU.

1. Open Google Colab: [https://colab.research.google.com](https://colab.research.google.com)
2. Upload `colab/comic_studio_backend.ipynb`
3. Run all cells — this will install ComfyUI and start a public tunnel URL
4. Copy the tunnel URL and paste it as `COMFYUI_URL` in your backend `.env` file
5. Restart your backend server

---

## 🎨 Using the Application

### 1. Create Characters

- Click the **Characters** tab in the left sidebar
- Click **"Add Character"**
- Upload 1–3 reference photos of the character
- Give the character a name and description
- Click **Save** — the system will process the identity embeddings

### 2. Generate a Panel

- Click the **Panels** tab
- Click **"New Panel"**
- Select your character(s) (up to 2 per panel)
- Write a scene description (e.g., *"two students sitting in a library, surprised expression"*)
- Choose a style and background
- Click **Generate** — this may take 30–90 seconds depending on your hardware

### 3. Add Speech Bubbles

- Open a generated panel
- Click the **Text** tab
- Click **"Add Bubble"** and select a bubble style (speech, thought, shout)
- Click anywhere on the panel to place the bubble
- Type your dialogue text
- Drag to reposition, resize handles to adjust size

### 4. Assemble a Comic Page

- Click the **Assembly** tab
- Drag generated panels onto the canvas
- Arrange panels into a comic page layout
- Resize and reorder panels as needed
- Export the final page as a PNG image

---

## 🗂️ Project Structure

```
backend/
├── main.py              # FastAPI application entry point
├── models.py            # SQLAlchemy database models
├── schemas.py           # Pydantic request/response schemas
├── database.py          # Database connection setup
├── routers/             # API endpoints (characters, panels, pages, bubbles)
├── services/            # Core logic (ComfyUI client, generation, storage)
└── workflows/           # ComfyUI JSON workflow definitions

frontend/
├── app/                 # Next.js pages (App Router)
├── components/          # React components by feature
│   ├── character/       # Character management UI
│   ├── panel/           # Panel generation UI
│   ├── text/            # Speech bubble editor
│   ├── assembly/        # Comic canvas assembler
│   └── layout/          # Navigation and sidebars
├── store/               # Zustand state stores
└── types/               # Shared TypeScript types

colab/
├── comic_studio_backend.ipynb   # Main backend notebook (ComfyUI + tunnel)
├── comic_studio_train.ipynb     # LoRA training notebook
└── comic_studio_caption.ipynb   # Auto-captioning notebook
```

---

## ❓ Troubleshooting

| Problem | Solution |
|---|---|
| `Connection refused` on generation | Make sure ComfyUI is running on port 8188 |
| Backend won't start | Check that your `.env` file exists and `COMFYUI_URL` is set |
| Frontend shows blank page | Run `npm install` again and restart with `npm run dev` |
| Character identity not consistent | Upload clearer, front-facing reference photos |
| Colab tunnel disconnects | Re-run the last cell in the backend notebook to get a new URL |

---

## 📬 Contact

For questions about this project, visit the repository:
**https://github.com/projectmanga2026-afk/ai-comic-studio-capstone**
