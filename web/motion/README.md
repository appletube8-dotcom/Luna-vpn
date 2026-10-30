# LUNA VPN motion study

A separate review prototype of the approved artistic Moon direction. The camera
approaches a crater surface, glides over it, and pulls back to a cropped Moon
beside the VPN account. It does not change the main site, bot, or backend.

## Timeline

- 0–12%: full Moon and a clear VPN introduction.
- 12–40%: forward camera motion; artistic surface detail replaces the enlarged
  lunar image while the frame is in motion.
- 40–65%: a close surface pass, with time to read the service message.
- 65–85%: camera pulls back and the Moon shifts to the left.
- 85–100%: account content becomes fully visible and remains readable.

This is an image-based 2.5D transition using two independent artistic renders
and a matched blend, not continuous scientific terrain geometry or a finished
3D camera render. It is intended to approve direction, pacing, and composition.
It does not simulate a true axial rotation of the Moon.

## Controls and accessibility

Native scrolling controls the playhead without replacing wheel or touch
scrolling. Chapter buttons jump to the three reading positions. Preview playback
can run the whole transition and stops on wheel/touch/key input, while the page
is hidden, or when a dialog opens. Only moving frames request animation frames.
Reduced-motion users see three still compositions with no camera zoom. Content
that is not visible is inert and hidden from assistive technology. No connection
status, subscribed plan, price, or service performance is fabricated.

## Assets

- `../preview/assets/artist-moon.webp`: the existing approved artistic Moon.
- `assets/crater-surface.webp`: new AI-generated cinematic lunar macro, created
  with the built-in image generator from the approved storyboard, exported as
  high-quality WebP. This is an artistic surface, not a named real crater or a
  NASA map.
- Existing project Montserrat and Cormorant fonts, with their existing licenses.

Generation brief: recreate the approved middle crater scene as a clean landscape
asset, no text or UI, warm silver/ivory grazing light, deep shadows, a large crater
right of center, detailed rocky foreground, natural distant falloff, no sky or
sphere edge. No rings, orbit lines, stars, neon, or NASA branding.

Sales and supplier integration remain outside this motion study. Connect/account
buttons explain the intended path to the real bot, and link to it only when a
valid public `LUNA_CONFIG.botUsername` is configured.
