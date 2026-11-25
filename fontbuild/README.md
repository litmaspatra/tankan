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

## Tankan Kalam, Eczar, Biryani, Khand
Four more own fonts, same encoding and cv01-cv40 system as Tankan Clean (fonts/Tankan-<Name>-Regular.ttf).
Outlines are re-drawn from open fonts through the Remington cmap and GSUB; every one is SIL OFL 1.1 and
carries its base font's copyright and licence in the name table. OFL text beside each file (Tankan-<Name>-OFL.txt).
- Tankan Kalam: Kalam Regular, Indian Type Foundry. https://github.com/google/fonts/tree/main/ofl/kalam
- Tankan Eczar: Eczar, The Eczar Project Authors. https://github.com/google/fonts/tree/main/ofl/eczar
- Tankan Biryani: Biryani Bold, Dan Reynolds and Mathieu Reguer. https://github.com/google/fonts/tree/main/ofl/biryani
- Tankan Khand: Khand Medium, Indian Type Foundry. https://github.com/google/fonts/tree/main/ofl/khand
None of the four OFL files declare a Reserved Font Name; the renamed "Tankan ..." family names are used anyway.
Known limits: plain z rakar stroke is still Mukta-style; Kalam bindu placement is approximate.
