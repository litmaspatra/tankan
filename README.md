# Tankan (टंकण) ⌨️

**Tankan** is an adaptive Hindi typing tutor specifically designed for the **Remington (GAIL)** layout, built in the aesthetic and pedagogical spirit of [keybr.com](https://www.keybr.com).

![Tankan Screenshot](https://raw.githubusercontent.com/litmaspatra/tankan/main/preview.png)

---

## 🌟 Key Features

- **Keybr.com Inspired Interface**: Clean dark/navy/amber/light themes, active letter mastery cards, live keystroke analytics, and an interactive virtual Remington keyboard.
- **Strict Error Blocking**: Wrong keystrokes do not advance the cursor. The cursor shakes red, sounds an error chime, records an accuracy penalty, and waits for the correct key.
- **Authentic KrutiDev 010 Engine**:
  - Six bundled **Remington legacy fonts** (KrutiDev 010 / 021 Italic / 070 Bold, DevLys 010 / 040 / 040 Bold) render every keystroke as its own glyph, so matras and half letters highlight individually - no broken OpenType ligatures. Unicode display fonts were removed for exactly that reason.
  - **Half-Letter Highlighting**: When typing composite letters (e.g., `श` typed as `'` + `k`), typing `'` highlights **only the half-letter `श्`** in green, and `k` completes the full consonant.
  - **Chhoti `ि` Matra (`f`)**: Typed before the consonant, matching authentic Remington GAIL typewriter rules.
  - **Reph `र्` (`Shift + Z`)**: Typed after the consonant, moving above automatically.
- **25 Words per Lesson**: Keybr standard phonotactic drills generated strictly from currently unlocked keys.
- **Speed-Maintenance Progression**: Keys unlock at the end of a lesson after banking 10 clean timings at the target speed (e.g. 25 WPM) with at least 95% lesson accuracy.

---

## 🚀 Running Locally or Deploying

Tankan is a static site - no build step or server code is required to run it.
(The test suite, not the site, needs Node.js and Playwright: `npm ci && npx playwright install --with-deps chromium && npm test`.)

1. **Local Run**: Double click `index.html` or open with any modern web browser.
2. **GitHub Pages**:
   - Go to **Settings** > **Pages** in this repository.
   - Set **Branch** to `main` and folder to `/ (root)`.
   - Click **Save**. Your typing tutor is live on the web!

---

## 📜 Keyboard Layout Reference (Remington GAIL)

| Hindi | Physical Key | Shift Key | Finger |
| :--- | :--- | :--- | :--- |
| **क** | `d` | `D` (`क्`) | Left Middle |
| **ा** | `k` | `K` (`ज्ञ`) | Right Middle |
| **ि** | `f` | `F` (`थ्`) | Left Index |
| **र** | `j` | `J` (`श्र`) | Right Index |
| **े** | `s` | `S` (`ै`) | Left Ring |
| **य** | `;` | `:` (`रू`) | Right Pinky |
| **स** | `l` | `L` (`स्`) | Right Ring |
| **ह** | `g` | `G` (`ळ`) | Left Index |
| **ं** | `a` | `A` (`।`) | Left Pinky |
| **ी** | `h` | `H` (`भ्`) | Right Index |
| **श** | `'` + `k` | `"` (`ष्`) | Right Pinky |
| **म** | `e` | `E` (`म्`) | Left Middle |
| **त** | `r` | `R` (`त्`) | Left Index |
| **न** | `u` | `U` (`न्`) | Right Index |
| **प** | `i` | `I` (`प्`) | Right Middle |
| **व** | `o` | `O` (`व्`) | Right Ring |
| **च** | `p` | `P` (`च्`) | Right Pinky |
| **ल** | `y` | `Y` (`ल्`) | Right Index |
| **ज** | `t` | `T` (`ज्`) | Left Index |
| **ु** | `q` | `Q` (`फ`) | Left Pinky |
| **ू** | `w` | `W` (`ॅ`) | Left Ring |
| **द** | `n` | `N` (`छ`) | Right Index |
| **ग** | `x` | `X` (`ग्`) | Left Ring |
| **ब** | `c` | `C` (`ब्`) | Left Middle |
| **अ** | `v` | `V` (`ट`) | Left Index |
| **इ** | `b` | `B` (`ठ`) | Left Index |
| **उ** | `m` | `M` (`ड`) | Right Index |
| **ए** | `,` | `<` (`ढ`) | Right Middle |
| **ण** | `.` + `k` | `>` (`झ`) | Right Ring |
| **ध** | `/` + `k` | `?` (`घ्`) | Right Pinky |
| **्र** | `z` | `Z` (`र्`) | Left Pinky |
| **ख** | `[` + `k` | `{` (`क्ष्`) | Right Pinky |
| **ृ** | `` ` `` | `~` (`्`) | Left Pinky |
| **त्र**| `=` | `+` (`़`) | Right Pinky |

## Text sources
Lesson settings (top of the Practice tab) include a text source: adaptive Hindi words (unlocks keys) or public-domain books and poems (Premchand, Kabir, Rahim, Tulsidas) from Hindi Wikisource, stored in `books.js`. Book lessons are free practice and do not unlock keys. Only texts whose authors died more than 60 years ago are included.

---

## 🗂 Project structure

Both pages are thin HTML shells; all styles and logic live under `src/` as plain CSS and classic (non-module) scripts, so everything still works from `file://` and GitHub Pages with no build step.

```
index.html                  Tankan tutor shell
hikeymash.html              Arena arcade shell
src/
  css/
    hikeybr.css             Tankan page styles
    hikeymash.css           Arena page styles
    hikeymash-overrides.css Arena overrides loaded after the shared sheets
    theme.css               Shared retro typewriter theme
    keyboard.css            Shared keyboard styles
  js/
    hikeybr/                Tutor: progression, state, audio, storage, engine
                            (unicode -> KrutiDev), keyboard, adaptive engine,
                            lessons, display, input, ui, init
    hikeymash/              Arcade: data, engine, quotes, audio, state,
                            keyboard, bots, picker, display, input, results,
                            insights, ui, lobby, init
books.js                    Book Reader stories (loaded by both pages)
data/books/                 Full novels (Nirmala, Godan) for the Book Reader
data/                       Quote and cinema libraries (Arena)
```

Each script is loaded in a fixed order with plain `<script src>` tags; shared top-level `let`/`const` bindings are visible to later scripts, exactly as when the code lived in one inline block.

## 🧪 Running the tests

The progression and UI tests use [Playwright](https://playwright.dev) (Chromium).

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` runs `tests/progression.cjs` (unlock gates, review isolation, saved-progress recovery, all 70 levels), `tests/ui.cjs` (real key events, custom text, Alt codes, settings sync, reload persistence), `tests/hikeymash.cjs` (lobby, race flow, results) and `tests/graphs.cjs` (chart math, profile migration, empty states). The same tests run in GitHub Actions on every push (`.github/workflows/tests.yml`).
