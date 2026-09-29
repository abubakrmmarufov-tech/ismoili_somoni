# Ismoili Somoni — a cinematic WebGPU recreation

A real-time, browser-based recreation of the **Ismoili Somoni monument on Dousti
Square, Dushanbe**. It is built to feel like graded camera footage: physically lit
by the real sun position over Dushanbe, shot through a simulated lens, and full of
small motion — trees, flags, fountain jets, birds and traffic.

Everything, including the 3D assets, is produced by code in this repository. No
Blender or other DCC tool was used.

```
npm install
npm run dev          # http://localhost:5173
npm run build        # static site in dist/ (deploy anywhere)
```

## What you see

| System | How it is made |
| --- | --- |
| **Statue** (13 m, gilded bronze) | Sculpted as a signed distance field in `tools/models/statue.mjs`. It is meshed with narrow-band Surface Nets on 62 M voxels, and cavity AO, curvature and a regalia mask are baked into a vertex attribute. It ships as Meshopt-compressed GLB LODs (25k / 134k / 500k triangles) that stream in coarse-first. |
| **Lions, crown** | The same SDF pipeline (`tools/models/lion.mjs`, `crown.mjs`). |
| **Portal / iwan** | Procedural geometry. The pointed two-centred arch, projecting frame and archivolt, the gold-mosaic niche and the **muqarnas half-dome** (tiers of staggered, corbelled concave cells with baked AO) are all generated in the browser. |
| **Materials** | World-space TSL PBR materials: gilded bronze with tarnish in the folds and rain streaks, travertine cladding with gilded Kufic frieze, rosettes and archivolt, polished red granite with mineral grains, flamed granite, plaza paving with wear and wet patches by the fountain, asphalt with lane markings, lawns with mowing stripes. High-frequency detail fades out with distance to prevent shimmer. |
| **Lighting** | NOAA solar position for Dushanbe (38.58° N, 68.78° E, UTC+5, 29 September). Preetham sky with procedural clouds, cascaded sun shadows (`SunLight`), and image-based lighting re-captured from the live sky whenever the time changes. Height fog is tinted by the sky radiance along each view ray (aerial perspective), with a Mie glow around the sun. |
| **Vegetation** | Chinar (oriental plane), pyramidal poplar, elm and clipped thuja. Branches come from three's `TreeGenerator`; crowns are leaf cards from a KTX2 atlas with transmitted light and shader wind. |
| **Gaussian splats** | Flower beds of petunias, marigolds and salvia are generated as a few hundred thousand anisotropic Gaussians at load time (zero download) and rendered with three's native `GaussianSplat`, relit to match the time of day. |
| **Water** | A custom pool shader with planar reflection of the monument (high tier), a two-scale normal map, ripples where the jets land, and GPU ballistic droplet particles. |
| **Life** | Flags with shader cloth simulation (Tajik flag rasterised to KTX2), pigeons and swifts with wing beats and glides, traffic on Rudaki Avenue, people on the plaza, the city beyond, the dry foothills and the Hisor range to the north. |
| **Camera** | A director plays ten shots. Field of view comes from the focal length (full-frame sensor). Depth of field comes from a thin-lens circle of confusion, with critically damped focus pulls, operator drift and dips to black at cuts. **Explore** mode switches to orbit controls. |
| **Post** | MRT scene pass → GTAO → TRAA → depth of field → bloom → lens chromatic aberration → ACES → contrast / split-tone / saturation grade → vignette and film grain. |

## Controls

- **Cinematic / Explore** (`C` / `E`): a guided film, or free orbit (drag, scroll, right-drag).
- **Time of day** (`T`): 06:30–18:36 local time, driving the sun, sky, lighting, fog and flower relighting.
- `N` skips to the next shot and `F` toggles fullscreen.

### URL parameters

| Parameter | Effect |
| --- | --- |
| `q=low\|medium\|high` | Force a quality tier (auto-detected otherwise) |
| `webgl` | Force the WebGL 2 backend |
| `time=17.4` | Start time (hours, Dushanbe) |
| `mode=explore` | Start in orbit mode |
| `shot=<name>&t=0.5&freeze` | Hold a frame of one shot (`establishing`, `approach`, `guardian`, `sovereign`, `sceptre`, `orbit`, `iwan`, `crown`, `trees`, `telephoto`) |
| `clean` | Hide all UI (for captures) |
| `statue=<url.glb>` | **Replace the sculpted statue with a real scan** (photogrammetry, or an image-to-3D model such as TRELLIS or Hunyuan3D). It keeps its own textures and is auto-scaled to 13 m on the plinth. Meshopt and KTX2 are supported. |
| `splat=<url.spz\|.splat\|.ply>&splatAt=x,y,z,scale,rotY` | Add a captured Gaussian-splat scene, e.g. a scan of the surrounding square |
| `tm=aces\|agx\|neutral`, `exp=1.0`, `fog=1.0` | Look-development overrides |
| `off=birds,splats,…` | Disable systems (profiling) |

## Performance and devices

`src/core/quality.js` picks a tier from WebGPU availability, device memory, core count and mobile detection:

- **High:** 4k shadow maps, GTAO, TRAA, planar water reflections, full splat density and grass/foliage density.
- **Medium:** TRAA and DOF, no AO or planar reflection.
- **Low** (mobile / WebGL 2): FXAA, 1k shadows, no splats.

A dynamic-resolution controller adjusts the render scale to hold the frame rate. Heavy systems load as separate chunks, and the coarse statue LOD appears first.

Build output: three.js ≈ 346 KB gzip, app code ≈ 30 KB gzip, assets ≈ 6.5 MB.

## Asset pipeline

```
npm run build:models     # SDF → surface nets → AO/curvature bake → meshopt simplify → GLB (EXT_meshopt_compression)
npm run build:textures   # JS rasteriser → Basis Universal KTX2 (ETC1S colour, UASTC normals) + basis transcoder
```

`node tools/build-models.mjs statue --draft` builds a coarse preview in a few seconds.
`tools/preview/` is a turntable viewer for the GLBs, and `node tools/shoot.mjs` captures frames headlessly through Chromium with WebGPU.

## Accuracy notes

The layout follows the published facts:
- A 13 m gilded bronze statue with a raised sceptre bearing the seven stars of the national emblem.
- A red granite plinth.
- An arch of about 43 m inspired by the Samanid mausoleum, with a golden iwan interior and stalactite (muqarnas) vaulting.
- A gilded crown on top, with two reclining lions either side.

Proportions, ornament and the surrounding square are artistic reconstructions, not survey data. The statue is an original sculpt made in code, not a scan of the real one. For a likeness, pass a photogrammetry or image-to-3D model with `?statue=`.

Architect: Bakhovadin Zukhuruddinov. Sculptor: Lev Kerbel. Unveiled in 1999 for the 1100th anniversary of the Samanid state.
