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
  }

  /**
   * Initialize the viewer and mount it to the DOM.
   * Currently uses Marzipano.
   */
  mount() {
    return new Promise((resolve, reject) => {
      try {
        const viewerOpts = {
          controls: { mouseViewMode: 'drag' }
        };
        this.viewer = new window.Marzipano.Viewer(this.container, viewerOpts);

        const source = window.Marzipano.ImageUrlSource.fromString(this.config.imageUrl);
        // We assume a standard equirectangular image setup for this prototype
        // Based on the original app.js logic
        const geometry = new window.Marzipano.EquirectGeometry([
          { width: this.config.panoramaWidth || 4000 }
        ]);
        
        const limiter = window.Marzipano.RectilinearView.limit.traditional(
          this.config.panoramaWidth || 4000,
          this.config.maxFov || (100 * Math.PI / 180)
        );
        
        const view = new window.Marzipano.RectilinearView(this.config.initialView, limiter);

        this.scene = this.viewer.createScene({ source, geometry, view, pinFirstLevel: true });
        this.scene.switchTo();
        
        resolve();
      } catch (err) {
        console.error('VRAdapter mount error:', err);
        reject(err);
      }
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
      v.setFov(v.fov() + delta);
    }
  }
  
  /**
   * Reset view to initial state.
   */
  resetView() {
    if (this.viewer && this.scene && this.config.initialView) {
      this.lookTo(this.config.initialView.yaw, this.config.initialView.pitch);
      const v = this.scene.view();
      v.setFov(this.config.initialView.fov);
    }
  }

  /**
   * Destroy the viewer and clean up.
   */
  destroy() {
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
      this.scene = null;
      this.hotspots = [];
    }
  }
}
