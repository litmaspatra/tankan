# Tankan Clean — build and provenance

"Tankan Clean" (fonts/Tankan-Clean-Regular.ttf) is a new own font, kept separate from the
existing टंकण Remington font.

## Provenance
- Base outlines: Mukta Bold (Ek Type), SIL Open Font License 1.1.
  License: https://scripts.sil.org/OFL (project copy: fonts/Tankan-Clean-OFL.txt).
  Source: https://github.com/google/fonts/tree/main/ofl/mukta
- Encoding, variant system (cv01-cv40), all 90 custom composite glyphs, and the hand-corrected
  marks (Bindu.dv, Visarga.dv, Vattu.dv) are carried over unchanged in position from the
  existing Tankan Remington font (Kartik's corrections). Customs were stroke-matched to the
  Bold weight by +32 units ink expansion (calibrated to Mukta Bold's stems) with position
  preserved; the whole font is widened 8% and word spacing opened (222 -> 340 upem).
- cmap and glyph order are byte-identical to Tankan-Remington-Regular.ttf, so the font drops
  in as a picker option with no app changes.
- The font's own name table carries the Ek Type copyright, the OFL license text and URL
  (nameIDs 0/13/14).

## Rebuild
    pip install fonttools skia-pathops
    # needs Mukta-Bold.ttf, Mukta-Regular.ttf (from google/fonts) and
    # fonts/Tankan-Remington-Regular.ttf; adjust paths in the script
    python3 fontbuild/build_v4.py
