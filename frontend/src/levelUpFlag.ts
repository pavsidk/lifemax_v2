// Shared flag set when a quest completion causes a level-up.
// SkillsScreen reads and clears it on focus to trigger the jump animation.

let _pending = false;
let _from = 1;
let _to = 2;

export function setLevelUpFlag(from: number, to: number) {
  _pending = true;
  _from = from;
  _to = to;
}

export function consumeLevelUpFlag(): { from: number; to: number } | null {
  if (!_pending) return null;
  _pending = false;
  return { from: _from, to: _to };
}
