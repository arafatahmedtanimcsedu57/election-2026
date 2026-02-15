# New Features Plan

## 1. Winner Symbol View Mode ("বিজয়ী প্রতীক")
- Add a 4th view mode that colors each region by its winning party's color (using existing SYMBOL_COLORS)
- Classic election map view — instantly see which party won where
- Legend shows symbol-to-color mapping instead of gradient bar
- Touches: VIEW_MODES array, styleFeature, getTooltipContent, gradientLegendConfig, JSX legend section

## 2. National Leaderboard (sidebar when no region selected)
- Replace the static "About" section with a national summary dashboard
- Show: total national votes, per-symbol ranked bar chart (aggregated across all 8 regions), regions won per symbol
- Keep a brief "About" section below
- Uses useMemo to compute national aggregates from electionData

## 3. Symbol Images in UI
- The 4 symbol PNGs in public/symbols/ are currently unused
- Display them in: winner banner, results list items, and national leaderboard entries
- Use `${import.meta.env.BASE_URL}symbols/${name}.png` for GitHub Pages compatibility
- Graceful fallback (colored dot) when image doesn't exist for a symbol

## 4. Region Quick Navigation
- Add a clickable region list/buttons at the top of the sidebar (only 8 regions, so a dropdown or button list is better than search)
- Clicking a region name selects it on the map
- Highlighted current selection

## Files to modify
- `src/App.jsx` — all logic changes
- `src/App.css` — new styles for leaderboard, symbol images, region nav
