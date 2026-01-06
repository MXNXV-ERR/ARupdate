
import * as THREE from 'three';
import { formatDistance } from './utils.js';

export class MeasureManager {
    constructor(scene) {
        this.scene = scene;
        this.points = [];
        this.pointMeshes = [];
        this.line = null;
        this.labels = [];
        this.allChains = [];
        this.previewLine = null;
    }

    addPoint(position) {
        // 1. Detect closed loop (snapping to first point)
        if (this.points.length >= 3) {
            const firstPoint = this.points[0];
            if (position.distanceTo(firstPoint) < 0.15) {
                // Close the loop
                this.isClosed = true;
                this.updateLine();
                return;
            }
        }
        this.isClosed = false;

        // 2. Prevent duplicate points
        if (this.points.length > 0) {
            const lastPoint = this.points[this.points.length - 1];
            if (position.distanceTo(lastPoint) < 0.1) {
                console.log("Point too close, ignoring");
                return;
            }
        }

        const p = position.clone();
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.012),
            new THREE.MeshBasicMaterial({
                color: 0x007bff,
                transparent: true,
                opacity: 0.9
            })
        );
        dot.position.copy(p);
        this.scene.add(dot);

        // Animation state for the dot
        dot.userData.phase = Math.random() * Math.PI * 2;

        this.pointMeshes.push(dot);
        this.points.push(p);

        this.updateLine();
    }

    updateAnimations(time) {
        // Pulse currently active dots
        this.pointMeshes.forEach(dot => {
            const phase = dot.userData.phase + time * 0.003;
            const scale = 1 + Math.sin(phase) * 0.2;
            dot.scale.set(scale, scale, scale);
        });

        // Pulse archived dots similarly
        this.allChains.forEach(chain => {
            chain.meshes.forEach(dot => {
                const phase = dot.userData.phase + time * 0.002;
                const scale = 1 + Math.sin(phase) * 0.15;
                dot.scale.set(scale, scale, scale);
            });
        });
    }

    undoLastPoint() {
        if (this.isClosed) {
            this.isClosed = false;
            this.updateLine();
            return;
        }
        if (this.points.length === 0) return;
        const mesh = this.pointMeshes.pop();
        this.scene.remove(mesh);
        this.points.pop();
        this.updateLine();
    }

    resetAll() {
        this.isClosed = false;
        // Clear history chains
        this.allChains.forEach(c => {
            c.meshes.forEach(m => this.scene.remove(m));
            if (c.line) this.scene.remove(c.line);
            c.labels.forEach(l => this.scene.remove(l));
        });
        this.allChains = [];

        // Clear current points
        this.points.forEach((_, i) => this.scene.remove(this.pointMeshes[i]));
        this.points = [];
        this.pointMeshes = [];

        if (this.line) {
            this.scene.remove(this.line);
            this.line = null;
        }

        if (this.previewLine) {
            this.scene.remove(this.previewLine);
            this.previewLine = null;
        }

        this.labels.forEach(l => this.scene.remove(l));
        this.labels = [];
    }

    startNewLine() {
        if (this.points.length < 2) return;
        this.allChains.push({
            points: [...this.points],
            meshes: [...this.pointMeshes],
            line: this.line,
            labels: [...this.labels],
            isClosed: this.isClosed
        });
        this.points = [];
        this.pointMeshes = [];
        this.line = null;
        this.labels = [];
        this.isClosed = false;
    }

    updateLine() {
        // Clean up current transient line and labels
        if (this.line) this.scene.remove(this.line);
        this.labels.forEach(l => this.scene.remove(l));
        this.labels = [];

        if (this.points.length < 2) return;

        // If closed, add first point to the end for line drawing
        const drawPoints = this.isClosed ? [...this.points, this.points[0]] : this.points;

        this.line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(drawPoints),
            new THREE.LineBasicMaterial({ color: 0xff0044, linewidth: 6 })
        );
        this.scene.add(this.line);

        // Add labels for segments
        for (let i = 1; i < drawPoints.length; i++) {
            const d = drawPoints[i - 1].distanceTo(drawPoints[i]);
            const mid = new THREE.Vector3().lerpVectors(drawPoints[i - 1], drawPoints[i], 0.5);
            const label = this.createLabel(d);
            label.position.copy(mid);
            label.scale.set(0.25, 0.1, 1);
            this.scene.add(label);
            this.labels.push(label);
        }
    }

    updatePreview(reticlePos) {
        if (this.isClosed) {
            if (this.previewLine) {
                this.scene.remove(this.previewLine);
                this.previewLine = null;
            }
            return;
        }

        // Remove existing preview
        if (this.previewLine) {
            this.scene.remove(this.previewLine);
            this.previewLine = null;
        }

        // Only draw if there's at least one point and reticle is visible
        if (this.points.length === 0 || !reticlePos) return;

        const lastPoint = this.points[this.points.length - 1];
        const geometry = new THREE.BufferGeometry().setFromPoints([lastPoint, reticlePos]);
        const material = new THREE.LineDashedMaterial({
            color: 0xffffff,
            dashSize: 0.02,
            gapSize: 0.01,
            transparent: true,
            opacity: 0.8,
            linewidth: 2
        });

        this.previewLine = new THREE.Line(geometry, material);
        this.previewLine.computeLineDistances();
        this.scene.add(this.previewLine);
    }

    createLabel(distMeters) {
        return this.createLabelSprite(distMeters);
    }

    setUnit(unit) {
        this.currentUnit = unit;
        this.updateLine();
        this.allChains.forEach(chain => {
            chain.labels.forEach(l => this.scene.remove(l));
            chain.labels = [];
            const pts = chain.isClosed ? [...chain.points, chain.points[0]] : chain.points;
            for (let i = 1; i < pts.length; i++) {
                const d = pts[i - 1].distanceTo(pts[i]);
                const mid = new THREE.Vector3().lerpVectors(pts[i - 1], pts[i], 0.5);
                const label = this.createLabel(d);
                label.position.copy(mid);
                label.scale.set(0.25, 0.1, 1);
                this.scene.add(label);
                chain.labels.push(label);
            }
        });
    }

    createLabelSprite(dist) {
        const cnv = document.createElement('canvas');
        const c = cnv.getContext('2d');
        cnv.width = 200; cnv.height = 70;
        c.fillStyle = 'rgba(0,0,0,0.9)'; c.fillRect(0, 0, 200, 70);
        c.fillStyle = '#fff'; c.font = 'bold 42px system-ui';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        const text = formatDistance(dist, this.currentUnit || 'm');
        c.fillText(text, 100, 35);
        return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cnv), depthTest: false }));
    }

    getTotalDistance(liveReticlePos) {
        let total = 0;
        for (let i = 1; i < this.points.length; i++) {
            total += this.points[i - 1].distanceTo(this.points[i]);
        }
        if (this.isClosed) {
            total += this.points[this.points.length - 1].distanceTo(this.points[0]);
        } else if (liveReticlePos && this.points.length > 0) {
            total += this.points[this.points.length - 1].distanceTo(liveReticlePos);
        }
        return total;
    }

    getArea() {
        if (!this.isClosed || this.points.length < 3) return 0;
        let area = 0;
        // Shoelace formula in X-Z plane (common for floor measurements)
        for (let i = 0; i < this.points.length; i++) {
            const p1 = this.points[i];
            const p2 = this.points[(i + 1) % this.points.length];
            area += p1.x * p2.z - p2.x * p1.z;
        }
        return Math.abs(area) / 2;
    }

    getPointCount() {
        return this.points.length;
    }

    hasContent() {
        return this.points.length > 0 || this.allChains.length > 0;
    }

    getPoints() {
        // Return active points. 
        // Note: For a full implementation we might want to include 'allChains' too, 
        // but for now let's focus on the active measurement for the overlay.
        return this.points;
    }
}
