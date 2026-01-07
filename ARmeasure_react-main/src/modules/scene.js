
import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

export class SceneManager {
    constructor(onRenderCallback, onSessionStart, onSessionEnd) {
        this.onRender = onRenderCallback;
        this.onSessionStart = onSessionStart;
        this.onSessionEnd = onSessionEnd;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controller = null;
    }

    init(overlayRoot) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '0'; // Behind UI (which is 1000)
        document.body.appendChild(this.renderer.domElement);

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

        const arButton = ARButton.createButton(this.renderer, {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: overlayRoot || document.body }
        });
        arButton.classList.add('custom-ar-button');
        document.body.appendChild(arButton);

        this.renderer.xr.addEventListener('sessionstart', () => this.onSessionStart());
        this.renderer.xr.addEventListener('sessionend', () => this.onSessionEnd());

        this.renderer.setAnimationLoop((t, frame) => {
            this.onRender(t, frame);
            this.renderer.render(this.scene, this.camera);
        });

        this.controller = this.renderer.xr.getController(0);
        this.scene.add(this.controller);
    }

    // Get the renderer canvas element
    getCanvas() {
        return this.renderer?.domElement;
    }

    // Get a MediaStream from the canvas for WebRTC streaming
    getCaptureStream(fps = 30) {
        if (this.renderer?.domElement) {
            return this.renderer.domElement.captureStream(fps);
        }
        return null;
    }

    // Helper to get session
    getSession() {
        return this.renderer.xr.getSession();
    }

    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
        }
        // Remove AR Button if identifiable? 
        // The ARButton helper creates a button with specific styles. We can try to find and remove it.
        const btn = document.querySelector('.custom-ar-button');
        if (btn) btn.remove();

        this.scene = null;
        this.camera = null;
        this.renderer = null;
    }
}
