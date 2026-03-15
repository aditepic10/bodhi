# Bodhi TUI - Design Context

## Users

Engineers using Bodhi as a personal memory tool during daily work. They interact through a full-screen terminal TUI while coding, debugging, and navigating projects. The interface must support long focused sessions without creating fatigue.

## Brand Personality

**Calm, precise, spacious.** Bodhi is named for awakening — the interface should help engineers slow down enough to think clearly while still feeling fast and capable. The personality comes through interaction quality, not decoration.

## Aesthetic Direction

- **References**: Linear and Raycast — minimal but opinionated, strong visual hierarchy, restrained palette, everything feels intentional and engineered
- **Anti-references**: Generic dark dashboards, hacker/cyberpunk neon, spiritual/mystical kitsch (no lotus flowers — the name speaks through feel, not motifs), overdesigned or animation-heavy interfaces
- **Theme**: Dark-first. Warm/mineral palette — not neon, not cold gray. Distinct but restrained accent colors. Readable over long sessions
- **Typography**: Respect the user's terminal font. Create hierarchy through spacing, weight, framing, and rhythm — not font changes
- **Density**: Breathable and meditative rather than maximally information-packed. Fewer louder elements, more intentional hierarchy

## Design Principles

1. **Hierarchy over uniformity** — Not every surface needs a border. Use whitespace, indentation, and subtle color shifts to create structure. Boxes are a last resort, not a default.
2. **The conversation wins** — Transcript content always takes visual priority over chrome, status, and controls. The interface should disappear and the work should come forward.
3. **Stillness communicates** — Motion should settle, not startle. Status changes should feel composed and confident. Empty states should feel spacious, not broken.
4. **Warmth without decoration** — The palette, spacing, and language should feel warm and grounded. No ornamental motifs, no gratuitous animation, no spiritual imagery.
5. **Terminal-native quality** — Everything must work within terminal constraints (keyboard-first, no mouse dependency, no color-only meaning, sensible on narrow terminals) while still feeling premium.

## Implementation Guidance

- Theme tokens live in `theme.ts`. All colors must come from semantic tokens, never inline hex values in components.
- Components are Bodhi-owned, built on raw Ink primitives. Do not add generic Ink component kits.
- The TUI must only consume `/chat` and `/chat/sessions` daemon contracts. No TUI-local session state.
- UI-only state stays in `tui/`. Session, message, and resume semantics stay in daemon/store/API layers.
- Test with `ink-testing-library`. Focus on user-visible render behavior, not implementation internals.
