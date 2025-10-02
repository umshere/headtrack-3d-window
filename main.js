/**
 * HeadTrack 3D Window - Main Application Logic
 * 
 * This application creates a head-tracked "window mode" effect using:
 * - MediaPipe Face Landmarker for real-time face detection
 * - Three.js for 3D rendering with off-axis projection
 * 
 * The key concept: as the user moves their head, the camera frustum
 * is adjusted to simulate looking through a window into a 3D space.
 */

import * as THREE from 'three';

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

// Calibration constants - adjust these for better accuracy
const IPD_MM = 63;              // Average interpupillary distance in millimeters
const SCREEN_WIDTH_M = 0.28;    // Physical screen width in meters (adjust for your display)
const SCREEN_HEIGHT_M = 0.16;   // Physical screen height in meters (adjust for your display)

// MediaPipe model URLs
const MEDIAPIPE_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm';
const FACE_LANDMARKER_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Landmark indices for left and right eyes (MediaPipe Face Mesh)
const LEFT_EYE_INDEX = 33;      // Left eye center
const RIGHT_EYE_INDEX = 263;    // Right eye center

// ============================================================================
// GLOBAL STATE
// ============================================================================

let faceLandmarker = null;
let video = null;
let canvas = null;
let scene, camera, renderer;
let lastVideoTime = -1;
let isDetecting = false;

// Current viewer position (in meters relative to screen center)
let viewerPosition = {
    x: 0,
    y: 0,
    z: 0.5  // Default distance from screen
};

// ============================================================================
// MEDIAPIPE SETUP
// ============================================================================

/**
 * Initialize MediaPipe Face Landmarker
 * Downloads the model and sets up the face detection pipeline
 */
async function initMediaPipe() {
    updateStatus('Loading MediaPipe model...');
    
    try {
        // Dynamically import MediaPipe Vision Tasks
        const { FaceLandmarker, FilesetResolver } = await import(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.js'
        );
        
        // Load WASM files
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
        
        // Create Face Landmarker with configuration
        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: FACE_LANDMARKER_MODEL,
                delegate: 'GPU'  // Use GPU acceleration if available
            },
            runningMode: 'VIDEO',
            numFaces: 1,  // Track only one face for performance
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        updateStatus('MediaPipe loaded successfully');
        return true;
    } catch (error) {
        console.error('Error initializing MediaPipe:', error);
        updateStatus('Error: Failed to load MediaPipe');
        return false;
    }
}

/**
 * Detect face landmarks in the current video frame
 * Returns the detected face landmarks or null
 */
function detectFaceLandmarks() {
    if (!faceLandmarker || !video || video.readyState !== 4) {
        return null;
    }
    
    // Only process if this is a new frame
    const videoTime = video.currentTime;
    if (videoTime === lastVideoTime) {
        return null;
    }
    lastVideoTime = videoTime;
    
    // Run face detection
    const results = faceLandmarker.detectForVideo(video, Date.now());
    
    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        return results.faceLandmarks[0];  // Return first face
    }
    
    return null;
}

// ============================================================================
// POSITION ESTIMATION
// ============================================================================

/**
 * Estimate viewer's position relative to the screen
 * Uses interpupillary distance to calculate depth (z)
 * and eye positions to calculate lateral position (x, y)
 * 
 * @param {Array} landmarks - Face landmarks from MediaPipe (normalized 0-1)
 * @returns {Object} - Viewer position {x, y, z} in meters
 */
function estimateViewerPosition(landmarks) {
    if (!landmarks || landmarks.length < 478) {
        return viewerPosition;  // Return last known position
    }
    
    // Get eye landmarks (normalized coordinates 0-1)
    const leftEye = landmarks[LEFT_EYE_INDEX];
    const rightEye = landmarks[RIGHT_EYE_INDEX];
    
    // Calculate interpupillary distance in normalized coordinates
    const dx = rightEye.x - leftEye.x;
    const dy = rightEye.y - leftEye.y;
    const ipdPixels = Math.sqrt(dx * dx + dy * dy);
    
    // Estimate depth (z) based on IPD
    // If the face is closer, IPD appears larger in the video
    // Known IPD in meters / Observed IPD ratio gives approximate distance
    const videoWidth = video.videoWidth;
    const ipdRatio = ipdPixels * videoWidth / (IPD_MM / 1000);
    const estimatedZ = Math.max(0.2, Math.min(2.0, SCREEN_WIDTH_M / ipdRatio));
    
    // Calculate center point between eyes
    const centerX = (leftEye.x + rightEye.x) / 2;
    const centerY = (leftEye.y + rightEye.y) / 2;
    
    // Convert to screen-relative coordinates (meters)
    // Note: Video is typically mirrored for natural interaction
    const x = (centerX - 0.5) * SCREEN_WIDTH_M * (estimatedZ / 0.5);
    const y = (0.5 - centerY) * SCREEN_HEIGHT_M * (estimatedZ / 0.5);
    
    // Apply smoothing to reduce jitter
    const smoothing = 0.7;
    viewerPosition.x = viewerPosition.x * smoothing + x * (1 - smoothing);
    viewerPosition.y = viewerPosition.y * smoothing + y * (1 - smoothing);
    viewerPosition.z = viewerPosition.z * smoothing + estimatedZ * (1 - smoothing);
    
    return viewerPosition;
}

// ============================================================================
// THREE.JS SETUP
// ============================================================================

/**
 * Initialize Three.js scene, camera, and renderer
 */
function initThreeJS() {
    updateStatus('Initializing Three.js...');
    
    // Get canvas element
    canvas = document.getElementById('canvas3d');
    
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ 
        canvas: canvas,
        antialias: true 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // Create camera with perspective projection
    // We'll manually update the projection matrix for off-axis projection
    camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.01,
        10
    );
    camera.position.set(0, 0, 0.5);
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 2, 3);
    scene.add(directionalLight);
    
    // Create 3D scene content
    createSceneContent();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    updateStatus('Three.js initialized');
}

/**
 * Create the 3D scene content
 * This is the "world inside the window"
 */
function createSceneContent() {
    // Create a room with walls to enhance parallax effect
    
    // Back wall with grid pattern
    const backWallGeometry = new THREE.PlaneGeometry(1, 0.6);
    const backWallMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4a5568,
        side: THREE.DoubleSide
    });
    const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
    backWall.position.z = -0.3;
    scene.add(backWall);
    
    // Add grid to back wall
    const gridHelper = new THREE.GridHelper(1, 10, 0x00ff00, 0x004400);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.z = -0.29;
    scene.add(gridHelper);
    
    // Create floating cubes at different depths
    const cubeGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    
    const colors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xff6b9d];
    const positions = [
        { x: -0.2, y: 0.1, z: -0.1 },
        { x: 0.2, y: -0.05, z: -0.15 },
        { x: 0, y: 0.15, z: -0.2 },
        { x: -0.15, y: -0.1, z: -0.05 },
        { x: 0.15, y: 0, z: -0.25 }
    ];
    
    positions.forEach((pos, i) => {
        const material = new THREE.MeshStandardMaterial({ color: colors[i] });
        const cube = new THREE.Mesh(cubeGeometry, material);
        cube.position.set(pos.x, pos.y, pos.z);
        cube.rotation.x = Math.random() * Math.PI;
        cube.rotation.y = Math.random() * Math.PI;
        scene.add(cube);
    });
    
    // Add a sphere in the center
    const sphereGeometry = new THREE.SphereGeometry(0.06, 32, 32);
    const sphereMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        emissive: 0x4a9eff,
        emissiveIntensity: 0.3
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(0, 0, -0.12);
    scene.add(sphere);
    
    // Add floor plane for depth reference
    const floorGeometry = new THREE.PlaneGeometry(1, 1);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x2d3748,
        side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = -0.3;
    scene.add(floor);
}

/**
 * Update camera with off-axis projection
 * This creates the "window" effect by adjusting the frustum
 * based on the viewer's head position
 * 
 * @param {Object} viewerPos - Viewer position {x, y, z}
 */
function updateCameraProjection(viewerPos) {
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.01;
    const far = 10;
    
    // Calculate frustum bounds based on viewer position
    // The frustum represents the viewing cone from the viewer's eye
    // through the "window" (screen) into the 3D world
    
    // Half dimensions of the screen in meters
    const halfWidth = SCREEN_WIDTH_M / 2;
    const halfHeight = SCREEN_HEIGHT_M / 2;
    
    // Distance from viewer to screen
    const distance = viewerPos.z;
    
    // Calculate frustum boundaries at the near plane
    // These are offset by the viewer's lateral position
    const left = (-halfWidth - viewerPos.x) * near / distance;
    const right = (halfWidth - viewerPos.x) * near / distance;
    const bottom = (-halfHeight - viewerPos.y) * near / distance;
    const top = (halfHeight - viewerPos.y) * near / distance;
    
    // Set custom projection matrix (off-axis projection)
    camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
    
    // Position camera at viewer's location
    camera.position.set(viewerPos.x, viewerPos.y, viewerPos.z);
    
    // Camera looks toward the center of the screen
    camera.lookAt(0, 0, 0);
}

/**
 * Handle window resize
 */
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================================
// WEBCAM SETUP
// ============================================================================

/**
 * Initialize webcam access
 */
async function initWebcam() {
    updateStatus('Requesting webcam access...');
    
    video = document.getElementById('webcam');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: false
        });
        
        video.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve();
            };
        });
        
        await video.play();
        
        updateStatus('Webcam ready');
        return true;
    } catch (error) {
        console.error('Error accessing webcam:', error);
        updateStatus('Error: Cannot access webcam');
        return false;
    }
}

// ============================================================================
// MAIN LOOP
// ============================================================================

/**
 * Main animation loop
 * Runs continuously to detect face and update rendering
 */
function animate() {
    requestAnimationFrame(animate);
    
    if (!isDetecting) {
        return;
    }
    
    // Detect face landmarks
    const landmarks = detectFaceLandmarks();
    
    if (landmarks) {
        // Estimate viewer position from landmarks
        const newPosition = estimateViewerPosition(landmarks);
        
        // Update camera with off-axis projection
        updateCameraProjection(newPosition);
        
        // Update status to show tracking is active
        if (!document.getElementById('status').textContent.includes('Tracking')) {
            updateStatus('✓ Tracking active - Move your head!');
        }
    } else {
        // No face detected
        if (document.getElementById('status').textContent.includes('Tracking')) {
            updateStatus('⚠ No face detected');
        }
    }
    
    // Render the scene
    renderer.render(scene, camera);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Update status message in UI
 */
function updateStatus(message) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
        console.log('[Status]', message);
    }
}

/**
 * Update calibration values in UI
 */
function updateCalibrationDisplay() {
    document.getElementById('ipd-value').textContent = IPD_MM;
    document.getElementById('screen-width-value').textContent = SCREEN_WIDTH_M.toFixed(2);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the entire application
 */
async function init() {
    console.log('🪟 HeadTrack 3D Window - Starting initialization...');
    
    // Update calibration display
    updateCalibrationDisplay();
    
    // Initialize Three.js first (doesn't require async)
    initThreeJS();
    
    // Initialize webcam
    const webcamReady = await initWebcam();
    if (!webcamReady) {
        updateStatus('Failed to initialize webcam');
        return;
    }
    
    // Initialize MediaPipe
    const mediaPipeReady = await initMediaPipe();
    if (!mediaPipeReady) {
        updateStatus('Failed to initialize MediaPipe');
        return;
    }
    
    // Everything ready - start detection
    isDetecting = true;
    updateStatus('Starting head tracking...');
    
    // Start animation loop
    animate();
    
    console.log('✓ Initialization complete!');
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
