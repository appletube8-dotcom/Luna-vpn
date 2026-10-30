# LUNA visual study

This isolated preview compares the approved artistic direction with a rotating
Moon rendered from real lunar maps. It does not replace the main website or
change the bot or account application.

## Lunar maps

Credit: **NASA's Scientific Visualization Studio**.

Source: [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), visualized by Ernie Wright.

- `assets/moon-color.jpg`: `lroc_color_2k.jpg`, 2048 × 1024, 2025 color map.
  https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg
- `assets/moon-height.jpg`: `ldem_3_8bit.jpg`, 1024 × 512, elevation map.
  https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg

Based on LRO / LROC (Arizona State University) and LOLA data. NASA describes the
color maps as prepared for visual rendering, rather than scientific analysis.
The preview uses artistic warm lighting, simplified sphere geometry with bump
shading, and accelerated axial rotation. The macro scene is a crop of the global
map, not a high-resolution photograph of a specifically identified crater.
NASA does not endorse Luna VPN.

## Other assets

- `assets/artist-moon.webp`: AI-generated artistic Moon, the approved visual
  reference; not a geographical map.
- Cormorant Garamond: Christian Thalmann, SIL Open Font License 1.1, distributed
  through the official google/fonts repository. License in
  `assets/CormorantGaramond-OFL.txt`. The preview bundles a Latin/Cyrillic WOFF
  subset generated from the original variable font.
- Montserrat: existing project fonts in `../assets/`, license in
  `../assets/Montserrat-OFL.txt`.

## Interaction

NASA mode rotates the mapped sphere about its axis. Drag horizontally to change
the orientation, or use Pause. Reduced-motion preferences disable automatic
rotation. Offscreen canvases are not drawn, and the animation stops while the
document is hidden. A Canvas 2D mapped-sphere renderer supports browsers without
WebGL. If rendering or asset loading fails, the artistic image remains available.
The preview does not make product availability or performance claims.
