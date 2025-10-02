# 🪟 HeadTrack 3D Window

Head-tracked “window mode” in the browser — using MediaPipe + Three.js.

This project turns your screen into a **dynamic 3D window** by tracking your head position in real time. As you move, the scene perspective shifts, creating a convincing parallax effect.

---

## 🚀 Demo

*(Move your head left and right in front of the camera to see the 3D world respond!)*

---

## ✨ Features

* Real-time **head tracking** with Google **MediaPipe Face Landmarker**
* **Off-axis camera projection** for realistic motion parallax
* Purely **web-based** — no backend or extra hardware needed
* Uses **Three.js** for 3D rendering

---

## 🛠️ Tech Stack

* [MediaPipe Tasks Vision (Web)](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)
* [Three.js](https://threejs.org/)
* Vanilla JavaScript (ES Modules)

---

## 📦 Setup

```bash
# clone the repo
git clone https://github.com/your-username/headtrack-3d-window.git
cd headtrack-3d-window

# install vite (or any static dev server)
npm install -g vite
vite
```

Open: `http://localhost:5173`

---

## 📄 How it Works

1. Capture webcam frames with `getUserMedia`.
2. Run **MediaPipe FaceLandmarker** on each frame to detect face + landmarks.
3. Estimate **viewer position** (x, y, z) relative to the screen.
4. Update the **Three.js camera frustum** using off-axis projection.
5. Render the scene with **parallax** that matches your head movement.

---

## 🔧 Calibration

* Default **interpupillary distance (IPD)**: `63 mm`.
* Default screen width: `0.28 m` (adjust in code).
* For better realism: measure your actual screen width and set `SCREEN_WIDTH_M` in `main.js`.

---

## 🗂️ Project Structure

```
headtrack-3d-window/
│── index.html        # entry point
│── main.js           # MediaPipe + Three.js logic
│── style.css         # minimal styling
│── assets/           # images, demo gif
└── README.md
```

---

## 🙌 Credits

* Inspired by demos of “Head-tracked Window Mode”
* Built with [Google MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/guide) + [Three.js](https://threejs.org/)

---

## 📜 License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
