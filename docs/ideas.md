# Ideas (not built yet)

- **An agent changes the slide.** Instead of (or as well as) clicking the whiteboard, clicking a lead
  sends them to the board: they walk over, point at the projector screen with the remote and the next stats
  page comes up (today → 7 days → 30 days), then they walk back to their desk. The screen itself is already
  done (`public/board.js`, `office.nextBoard()`); this needs a short `loc.type 'board'` walk in `office.js`
  plus a "point" pose in `sprites.js`.
- **Wall switch for the lounge lamp / neon** next to the light switch.
