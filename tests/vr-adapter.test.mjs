import assert from 'node:assert/strict';
import test from 'node:test';

import { VRAdapter } from '../public/assets/js/vr-adapter.js';

function installBrowserStubs({ width = 1774, height = 887 } = {}) {
  class FakeImage {
    set src(value) {
      this.currentSrc = value;
      this.naturalWidth = width;
      this.naturalHeight = height;
      queueMicrotask(() => this.onload());
    }
  }

  class FakeView {
    constructor(initial) {
      this.values = { ...initial };
    }
    yaw() { return this.values.yaw; }
    pitch() { return this.values.pitch; }
    fov() { return this.values.fov; }
    setYaw(value) { this.values.yaw = value; }
    setPitch(value) { this.values.pitch = value; }
    setFov(value) { this.values.fov = value; }
  }
  FakeView.limit = { traditional: () => ({ type: 'limiter' }) };

  class FakeViewer {
    constructor(container) {
      this.container = container;
      this.destroyed = false;
      this.updated = false;
    }
    createScene({ view }) {
      const hotspots = [];
      return {
        switched: false,
        switchTo() { this.switched = true; },
        view: () => view,
        hotspotContainer: () => ({
          createHotspot: (element, coordinates) => {
            const hotspot = { element, coordinates };
            hotspots.push(hotspot);
            return hotspot;
          },
        }),
      };
    }
    updateSize() { this.updated = true; }
    destroy() { this.destroyed = true; }
  }

  globalThis.Image = FakeImage;
  globalThis.window = {
    Marzipano: {
      Viewer: FakeViewer,
      ImageUrlSource: { fromString: (url) => ({ url }) },
      EquirectGeometry: class { constructor(levels) { this.levels = levels; } },
      RectilinearView: FakeView,
    },
  };
}

test('VR adapter mounts a valid equirectangular scene and supports controls', async () => {
  installBrowserStubs();
  const adapter = new VRAdapter({}, {
    imageUrl: '/assets/panorama/manual-handling-360-v2.png',
    panoramaWidth: 1774,
    initialView: { yaw: -0.38, pitch: -0.13, fov: 2.04 },
  });

  await adapter.mount();
  assert.equal(adapter.scene.switched, true);
  assert.equal(adapter.viewer.updated, true);

  const hotspot = adapter.addHotspot({ element: {}, yaw: 1.2, pitch: -0.2 });
  assert.deepEqual(hotspot.coordinates, { yaw: 1.2, pitch: -0.2 });

  adapter.zoom(-10);
  assert.equal(adapter.getView().fov, adapter.minFov);
  adapter.lookTo(0.5, 0.25);
  assert.deepEqual(adapter.getView(), { yaw: 0.5, pitch: 0.25, fov: adapter.minFov });

  adapter.resetView();
  assert.deepEqual(adapter.getView(), { yaw: -0.38, pitch: -0.13, fov: 2.04 });
  adapter.destroy();
  assert.equal(adapter.viewer, null);
});

test('VR adapter rejects a non-equirectangular scene before creating a viewer', async (context) => {
  context.mock.method(console, 'error', () => {});
  installBrowserStubs({ width: 1600, height: 1000 });
  const adapter = new VRAdapter({}, {
    imageUrl: '/assets/panorama/invalid.png',
    initialView: { yaw: 0, pitch: 0, fov: 1 },
  });

  await assert.rejects(adapter.mount(), /2:1 equirectangular image/);
  assert.equal(adapter.viewer, null);
});
