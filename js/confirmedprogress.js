// ============================================================
// PROGRESSO CONFIRMADO DO CONVIDADO
//
// A posição local pode ser prevista entre snapshots, mas progresso não. Esta
// camada só compõe um checkpoint quando o host confirmou o mesmo estado em:
//   1. `s`: identidade, XP, ouro, andar e versão de inventário; e
//   2. `inv`: a mochila/equipamento daquela mesma versão.
//
// O DataChannel confiável entrega na ordem normal; as chaves `ti` e `iv`
// tornam essa ordem verificável mesmo em teste, replay ou entrega atrasada.
// A composição não conhece storage. P2-07 usa a projeção abaixo no instante
// terminal, com um escritor injetado, para não puxar localStorage para este
// modelo que também roda em Node.
// ============================================================

const plainObject = value =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

function jsonCopy(value) {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? null : JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function finiteInt(value) {
  return Number.isSafeInteger(value) ? value : null;
}

function validPotions(potions) {
  return plainObject(potions) && finiteInt(potions.hp) !== null && finiteInt(potions.mp) !== null;
}

function snapshotFor(snapshot, id, voc) {
  if (!plainObject(snapshot) || snapshot.t !== 's' || !Array.isArray(snapshot.P)) return null;
  const time = snapshot.ti;
  const floor = finiteInt(snapshot.fl);
  if (!Number.isFinite(time) || floor === null || floor < 1) return null;

  const player = snapshot.P.find(entry => plainObject(entry) && entry.i === id);
  if (!player || player.v !== voc) return null;
  const inventoryVersion = finiteInt(player.iv);
  if (
    inventoryVersion === null ||
    inventoryVersion < 1 ||
    !Number.isSafeInteger(player.l) ||
    player.l < 1 ||
    !Number.isSafeInteger(player.xp) ||
    player.xp < 0 ||
    !Number.isSafeInteger(player.g) ||
    player.g < 0 ||
    typeof player.n !== 'string'
  )
    return null;

  return {
    time,
    floor,
    inventoryVersion,
    player: {
      name: player.n,
      voc: player.v,
      level: player.l,
      xp: player.xp,
      gold: player.g,
    },
  };
}

function inventoryFor(message, id) {
  if (!plainObject(message) || message.t !== 'inv' || message.i !== id) return null;
  const version = finiteInt(message.iv);
  if (
    version === null ||
    version < 1 ||
    !Array.isArray(message.inv) ||
    !plainObject(message.equip) ||
    !validPotions(message.potions)
  )
    return null;

  // O clone corta referências à mensagem e também rejeita ciclo/valores que
  // não podem atravessar o localStorage. A validação completa continua no
  // caminho de save existente quando P2-07 for ligar a gravação.
  const value = jsonCopy({
    inv: message.inv,
    equip: message.equip,
    potions: message.potions,
  });
  return value ? { version, ...value } : null;
}

function persistenceOrder(projection) {
  const order = projection?.order;
  if (!plainObject(order) || !Number.isFinite(order.snapshotTime)) return null;
  const inventoryVersion = finiteInt(order.inventoryVersion);
  if (inventoryVersion === null || inventoryVersion < 1) return null;
  return { snapshotTime: order.snapshotTime, inventoryVersion };
}

function compareOrder(left, right) {
  if (left.snapshotTime !== right.snapshotTime) return left.snapshotTime - right.snapshotTime;
  return left.inventoryVersion - right.inventoryVersion;
}

function parsePersistenceFingerprint(value) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    if (!plainObject(parsed) || parsed.v !== 1 || !plainObject(parsed.save)) return null;
    const order = persistenceOrder({ order: parsed.order });
    return order ? { save: JSON.stringify(parsed.save), order } : null;
  } catch (e) {
    return null;
  }
}

// Mantém o efeito de storage fora do modelo e deixa explícito o token que torna
// a tentativa terminal idempotente. O token guarda a ordem confirmada como
// watermark, mas separa-a do conteúdo do save: confirmação mais nova do mesmo
// personagem avança o watermark sem regravar; confirmação atrasada não pode
// substituir um save terminal já mais novo.
export function persistConfirmedProjection(projection, previousFingerprint, writeSave) {
  if (
    !plainObject(projection) ||
    !plainObject(projection.player) ||
    typeof writeSave !== 'function'
  ) {
    return { saved: false, fingerprint: previousFingerprint || null };
  }

  const floor = finiteInt(projection.floor);
  const player = jsonCopy(projection.player);
  if (floor === null || floor < 1 || !player) {
    return { saved: false, fingerprint: previousFingerprint || null };
  }

  const order = persistenceOrder(projection);
  if (!order) return { saved: false, fingerprint: previousFingerprint || null };

  const candidate = { floor, player };
  const candidateSave = JSON.stringify(candidate);
  const fingerprint = JSON.stringify({ v: 1, order, save: candidate });
  const previous = parsePersistenceFingerprint(previousFingerprint);
  if (previous) {
    const comparison = compareOrder(order, previous.order);
    if (comparison < 0) return { saved: false, fingerprint: previousFingerprint };
    if (candidateSave === previous.save)
      return { saved: false, fingerprint: comparison > 0 ? fingerprint : previousFingerprint };
    if (comparison === 0) return { saved: false, fingerprint: previousFingerprint };
  } else if (fingerprint === previousFingerprint) {
    return { saved: false, fingerprint };
  }

  try {
    const saved = writeSave(player, floor) === true;
    return { saved, fingerprint: saved ? fingerprint : previousFingerprint || null };
  } catch (e) {
    return { saved: false, fingerprint: previousFingerprint || null };
  }
}

export class ConfirmedProgress {
  constructor({ id, voc } = {}) {
    this.id = typeof id === 'string' ? id : '';
    this.voc = typeof voc === 'string' ? voc : '';
    this.snapshot = null;
    this.inventory = null;
    this.lastSnapshotTime = -Infinity;
    this.lastSnapshotInventoryVersion = 0;
    this.lastInventoryVersion = 0;
    this.confirmed = null;
  }

  acceptSnapshot(message) {
    const next = snapshotFor(message, this.id, this.voc);
    if (
      !next ||
      next.time <= this.lastSnapshotTime ||
      next.inventoryVersion < this.lastSnapshotInventoryVersion
    )
      return false;

    this.snapshot = next;
    this.lastSnapshotTime = next.time;
    this.lastSnapshotInventoryVersion = next.inventoryVersion;
    this.compose();
    return true;
  }

  acceptInventory(message) {
    const next = inventoryFor(message, this.id);
    if (!next || next.version <= this.lastInventoryVersion) return false;

    this.inventory = next;
    this.lastInventoryVersion = next.version;
    this.compose();
    return true;
  }

  compose() {
    if (
      !this.snapshot ||
      !this.inventory ||
      this.snapshot.inventoryVersion !== this.inventory.version
    )
      return false;

    this.confirmed = {
      id: this.id,
      floor: this.snapshot.floor,
      order: {
        snapshotTime: this.snapshot.time,
        inventoryVersion: this.inventory.version,
      },
      player: {
        ...this.snapshot.player,
        potions: this.inventory.potions,
        equip: this.inventory.equip,
        inv: this.inventory.inv,
      },
    };
    return true;
  }

  // O consumidor recebe sempre uma cópia plana: guardar a projeção depois não
  // pode alterar o checkpoint recebido do host nem vice-versa.
  toSaveProjection() {
    return this.confirmed ? jsonCopy(this.confirmed) : null;
  }
}
