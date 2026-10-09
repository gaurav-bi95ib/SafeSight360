/**
 * SafeSight360 — VR Adapter
 * Abstract layer over Marzipano to allow future swapping to WebXR.
 */

export class VRAdapter {
  /**
   * @param {HTMLElement} container - The DOM element to mount the viewer in.
   * @param {Object} config - Configuration options (imageUrl, initialView).
   */
  constructor(container, config) {
    this.container = container;
    this.config = config;
    this.viewer = null;
    this.scene = null;
    this.hotspots = [];
    this.resizeObserver = null;
    this.minFov = Number.isFinite(config.minFov) ? config.minFov : (42 * Math.PI / 180);
    this.maxFov = Number.isFinite(config.maxFov) ? config.maxFov : (122 * Math.PI / 180);
  }

  /**
   * Initialize the viewer and mount it to the DOM.
   * Currently uses Marzipano.
   */
  async mount() {
      try {
        if (!this.container) throw new Error('Panorama container is missing.');
        if (!window.Marzipano) throw new Error('Marzipano did not load. Check the vendor script path.');
        if (!this.config.imageUrl) throw new Error('Panorama image URL is missing.');

        const image = await this.loadImage(this.config.imageUrl);
        const actualWidth = image.naturalWidth || this.config.panoramaWidth || 4000;
        const actualHeight = image.naturalHeight || Math.round(actualWidth / 2);
        if (Math.abs((actualWidth / actualHeight) - 2) > 0.03) {
          throw new Error(`Panorama must use a 2:1 equirectangular image; received ${actualWidth}x${actualHeight}.`);
        }

        const viewerOpts = {
          controls: { mouseViewMode: 'drag' }
        };
        this.viewer = new window.Marzipano.Viewer(this.container, viewerOpts);

        const source = window.Marzipano.ImageUrlSource.fromString(this.config.imageUrl);
        // We assume a standard equirectangular image setup for this prototype
        // Based on the original app.js logic
        const geometry = new window.Marzipano.EquirectGeometry([
          { width: actualWidth }
        ]);
        
        const limiter = window.Marzipano.RectilinearView.limit.traditional(
          actualWidth,
          this.maxFov
        );
        
        const initialView = {
          ...this.config.initialView,
          fov: this.clampFov(this.config.initialView?.fov || this.maxFov)
        };
        const view = new window.Marzipano.RectilinearView(initialView, limiter);

        this.scene = this.viewer.createScene({ source, geometry, view, pinFirstLevel: true });
        this.scene.switchTo();
        this.viewer.updateSize();
        if (typeof ResizeObserver !== 'undefined') {
          this.resizeObserver = new ResizeObserver(() => this.viewer?.updateSize());
          this.resizeObserver.observe(this.container);
        }
      } catch (err) {
        console.error('VRAdapter mount error:', err);
        this.destroy();
        throw err;
      }
  }

  loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Panorama image could not load: ${url}`));
      image.src = url;
    });
  }

  /**
   * Add a hotspot to the scene.
   * @param {Object} hotspotConfig - Hotspot data (yaw, pitch, element).
   */
  addHotspot(hotspotConfig) {
    if (!this.scene) return null;
    
    const hs = this.scene.hotspotContainer().createHotspot(
      hotspotConfig.element,
      { yaw: hotspotConfig.yaw, pitch: hotspotConfig.pitch },
      { perspective: { radius: 1640, extraTransforms: "rotateX(5deg)" } }
    );
    
    this.hotspots.push(hs);
    return hs;
  }

  /**
   * Look to a specific coordinate.
   * @param {number} yaw 
   * @param {number} pitch 
   */
  lookTo(yaw, pitch) {
    if (this.viewer && this.scene) {
      this.scene.view().setYaw(yaw);
      this.scene.view().setPitch(pitch);
    }
  }

  /**
   * Get the current view parameters.
   * @returns {Object} {yaw, pitch, fov}
   */
  getView() {
     if(!this.scene) return { yaw: 0, pitch: 0, fov: 0 };
     const v = this.scene.view();
     return { yaw: v.yaw(), pitch: v.pitch(), fov: v.fov() };
  }

  /**
   * Adjust zoom level.
   * @param {number} delta - Positive to zoom in, negative to zoom out.
   */
  zoom(delta) {
    if (this.viewer && this.scene) {
      const v = this.scene.view();
      v.setFov(this.clampFov(v.fov() + delta));
    }
  }
  
  /**
   * Reset view to initial state.
   */
  resetView() {
    if (this.viewer && this.scene && this.config.initialView) {
      this.lookTo(this.config.initialView.yaw, this.config.initialView.pitch);
      const v = this.scene.view();
      v.setFov(this.clampFov(this.config.initialView.fov));
    }
  }

  clampFov(fov) {
    return Math.min(this.maxFov, Math.max(this.minFov, fov));
  }

  /**
   * Destroy the viewer and clean up.
   */
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
      this.scene = null;
      this.hotspots = [];
    }
  }
}
