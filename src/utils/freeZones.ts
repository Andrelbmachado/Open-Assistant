/**
 * Zonas livres do chat: onde o robô do modo voz pode flutuar sem cobrir texto nem imagem.
 *
 * Medido no app (DESIGN.md › "Zonas livres"): as mensagens ficam numa coluna central de até 780 px
 * (`.msg`), o compositor numa faixa de até ~800 px no rodapé e o cabeçalho da área no topo. Sobram as
 * **laterais** da coluna, do cabeçalho até o compositor. Elas só servem se couber o robô inteiro.
 */

export interface Box { left: number; top: number; right: number; bottom: number }
export interface Zone extends Box { side: "left" | "right" }

/** Coluna de conteúdo das mensagens (`.msg { max-width: 780px; margin: 0 auto }`). */
export const CONTENT_MAX_WIDTH = 780;
/** Folga mínima entre o robô e o texto. */
export const ZONE_GAP = 16;

/**
 * Laterais livres da área de chat. `messages` = retângulo da lista de mensagens (sem a barra de
 * rolagem), `column` = coluna de conteúdo, `composerTop` = topo do compositor, `robot` = tamanho do robô.
 * Devolve a área onde o **canto superior esquerdo** do robô pode ficar.
 */
export function freeZones(messages: Box, column: Box, composerTop: number, robot: { width: number; height: number }, gap = ZONE_GAP): Zone[] {
  const top = messages.top + gap;
  const bottom = Math.min(messages.bottom, composerTop) - gap - robot.height;
  if (bottom < top) return [];
  const zones: Zone[] = [];
  const leftSpace = { left: messages.left + gap, right: column.left - gap - robot.width };
  const rightSpace = { left: column.right + gap, right: messages.right - gap - robot.width };
  if (leftSpace.right >= leftSpace.left) zones.push({ side: "left", left: leftSpace.left, right: leftSpace.right, top, bottom });
  if (rightSpace.right >= rightSpace.left) zones.push({ side: "right", left: rightSpace.left, right: rightSpace.right, top, bottom });
  return zones;
}

/**
 * Chat estreito demais para as laterais (ex.: área dividida): o robô fica na borda direita **da própria
 * área de chat**, do cabeçalho até o compositor — cobre um pouco do texto, mas nunca vai para outra área.
 */
export function fallbackZone(messages: Box, composerTop: number, robot: { width: number; height: number }, gap = ZONE_GAP): Zone | undefined {
  const top = messages.top + gap;
  const bottom = Math.min(messages.bottom, composerTop) - gap - robot.height;
  const x = Math.max(messages.left + gap, messages.right - gap - robot.width);
  return bottom < top ? undefined : { side: "right", left: x, right: x, top, bottom };
}

/** Coluna central de conteúdo dentro da lista de mensagens (mesma regra do CSS). */
export function contentColumn(messages: Box, paddingX: number, maxWidth = CONTENT_MAX_WIDTH): Box {
  const inner = messages.right - messages.left - paddingX * 2;
  const width = Math.min(maxWidth, inner);
  const left = messages.left + (messages.right - messages.left - width) / 2;
  return { left, top: messages.top, right: left + width, bottom: messages.bottom };
}

/** Zona mais perto do ponto (o robô fica na lateral onde foi deixado). */
export function nearestZone(zones: Zone[], point: { x: number; y: number }): Zone | undefined {
  const distance = (zone: Zone) => {
    const x = Math.min(Math.max(point.x, zone.left), zone.right);
    const y = Math.min(Math.max(point.y, zone.top), zone.bottom);
    return Math.hypot(point.x - x, point.y - y);
  };
  return [...zones].sort((a, b) => distance(a) - distance(b))[0];
}

/** Traz o ponto para dentro da zona. */
export function clampToZone(point: { x: number; y: number }, zone: Box): { x: number; y: number } {
  return { x: Math.min(Math.max(point.x, zone.left), zone.right), y: Math.min(Math.max(point.y, zone.top), zone.bottom) };
}

/** Próximo ponto do passeio: perto de onde está, dentro da mesma zona. `random` injetável para teste. */
export function wanderTarget(zone: Box, from: { x: number; y: number }, random: () => number = Math.random, reach = { x: 70, y: 150 }): { x: number; y: number } {
  return clampToZone({ x: from.x + (random() * 2 - 1) * reach.x, y: from.y + (random() * 2 - 1) * reach.y }, zone);
}
