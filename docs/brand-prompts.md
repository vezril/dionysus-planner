# Brand prompts — the neon god marks

The visual family for the homelab services: cyberpunk neon line-art
portrait of the service's namesake god, cyan (#00F4F6) circuit-linework
base, ONE accent color per god, near-black violet ground (#06060F —
the ui-theme --background), clean minimal vector lines, soft glow,
centered emblem, no text. Accents map to the theme palette so the set
reads as one system.

| Service | God | Accent | Motif |
| --- | --- | --- | --- |
| dionysus | Dionysus | magenta #FF30D3 (--accent) | grape clusters + vine circuit-wreath |
| demeter | Demeter | amber #EDB417 (--status-near) | wheat-sheaf circuit crown |
| hermes | Hermes | green #0AE442 (--status-cookable) | winged helm + caduceus signal lines |
| apollo | Apollo | warm gold-white | laurel sun-ray traces + lyre strings |

## Dionysus (reverse-engineered from the shipped mark)

> Cyberpunk neon line-art logo of Dionysus, Greek god of wine, serene
> male profile in glowing cyan circuit-linework, crowned with an ivy
> and grapevine wreath rendered as circuit traces, grape clusters as
> glowing magenta nodes, dark near-black violet background (#06060F),
> clean minimal vector lines with a soft neon glow, centered emblem,
> no text

## Demeter

> Cyberpunk neon line-art logo of Demeter, Greek goddess of the
> harvest, serene female profile in glowing cyan circuit-linework,
> crowned with a wreath of wheat sheaves and barley rendered as
> golden-amber neon circuit traces, a few glowing grain kernels as
> nodes, dark near-black violet background (#06060F), clean minimal
> vector lines with a soft neon glow, centered emblem, no text

## Hermes

> Cyberpunk neon line-art logo of Hermes, Greek messenger god, sharp
> youthful profile in glowing cyan circuit-linework, winged helm with
> feathers as swept neon-green circuit traces, a small caduceus with
> twin serpents as intertwined signal lines behind the head, sense of
> speed and motion, dark near-black violet background (#06060F), clean
> minimal vector lines with a soft neon glow, centered emblem, no text

## Apollo

> Cyberpunk neon line-art logo of Apollo, Greek god of the sun and
> music, classical male profile in glowing cyan circuit-linework,
> radiant laurel wreath whose leaves become warm golden-white sun-ray
> circuit traces fanning outward, a subtle lyre outline of glowing
> strings at the base, dark near-black violet background (#06060F),
> clean minimal vector lines with a soft neon glow, centered emblem,
> no text

Asset pipeline once generated (per the app-logo change): checkerboard-
key the export onto the --background violet, re-synthesize the soft
glow, then cut app/icon.png (favicon), app/apple-icon.png, and
public/logo.png.
