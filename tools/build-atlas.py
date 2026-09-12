# Gera assets/tiles.png a partir do pack CC0 "Isometric Miniature Dungeon" (Kenney).
# Fonte: https://kenney.nl/assets/isometric-miniature-dungeon (licença CC0 1.0).
# Uso: python3 tools/build-atlas.py /caminho/para/pack/Isometric
# Não é passo de build do deploy — roda uma vez e o PNG resultante é commitado.
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/kenney/Isometric')
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'tiles.png'

# Célula do atlas: 64 de largura, 48 de altura (32 do losango + 16 de espessura).
# O losango do pack tem 256x128 no topo do PNG 256x512 — escala exata de 1/4.
CELL_W, CELL_H = 64, 48
CROP_H = CELL_H * 4  # 192px na fonte

# Linhas do atlas (uma por tipo de chão), colunas = variantes.
ROWS = [
    ('FLOOR', ['stoneTile_N', 'stone_N', 'stoneUneven_N', 'stoneMissingTiles_N']),
    ('RUBBLE', ['dirtTiles_N', 'dirt_N']),
    ('GRASS', ['dirt_N', 'dirtTiles_N']),  # base de terra; o verde vem de tint abaixo
]

max_cols = max(len(r[1]) for r in ROWS)

# Parede apocalíptica: monólitos de obsidiana sintetizados (o pack não tem nada
# dark). Desenho em 4x (256 de largura) e reduzo para 64 — o LANCZOS faz o
# antialias. Cada variante é um perfil de espinhos diferente; rng com seed fixa
# mantém a geração determinística. Espinhos sobem até 24px acima do topo do
# bloco, então a célula é mais alta: (128 losango + 120 extrusão + 96 espinho)/4.
WALL_CELL_H = 86
WALL_VARIANTS = 4

atlas = Image.new(
    'RGBA', (CELL_W * max_cols, CELL_H * len(ROWS) + WALL_CELL_H), (0, 0, 0, 0)
)


def load_slab(name):
    im = Image.open(SRC / f'{name}.png').convert('RGBA')
    y0 = im.getbbox()[1]
    return im.crop((0, y0, 256, min(512, y0 + CROP_H)))


def tint_cold(tile, rgb=(112, 100, 138)):
    # Tint frio: o pack é areia-clara, o dungeon é roxo-escuro (#332c3d).
    # Multiply escurece e puxa o matiz sem matar o detalhe. O valor default
    # aproxima o chão da FLOOR_PALETTE antiga; paredes usam tom mais escuro
    # e azulado para não fundir com o chão (feedback do Filipe 05/09).
    tint = Image.new('RGBA', tile.size, rgb + (255,))
    tinted = ImageChops.multiply(tile, tint)
    tinted.putalpha(tile.getchannel('A'))
    return tinted


for row, (kind, names) in enumerate(ROWS):
    for col, name in enumerate(names):
        im = Image.open(SRC / f'{name}.png').convert('RGBA')
        bbox = im.getbbox()
        y0 = bbox[1]
        tile = im.crop((0, y0, 256, min(512, y0 + CROP_H)))
        tile = tile.resize((CELL_W, tile.height // 4), Image.LANCZOS)
        # Tint frio: o pack é areia-clara, o dungeon é roxo-escuro (#332c3d).
        # Multiply por lavanda escurece e puxa o matiz sem matar o detalhe.
        if kind != 'GRASS':
            tile = tint_cold(tile)
        if kind == 'GRASS':
            # Tint verde-musgo: o pack não tem grama isométrica plana.
            overlay = Image.new('RGBA', tile.size, (60, 110, 45, 0))
            overlay.putalpha(tile.getchannel('A').point(lambda a: min(a, 120)))
            tile = Image.alpha_composite(tile, overlay)
            tile = ImageEnhance.Brightness(tile).enhance(0.85)
        atlas.paste(tile, (col * CELL_W, row * CELL_H), tile)

# Linha da parede (y = CELL_H * len(ROWS)): monólito de obsidiana desenhado em
# 4x. Geometria-fonte: losango 256x128, extrusão 120, espinhos até 96 acima.
# Faces com facetas irregulares, veios roxos (ecoa o portal #965aff da UI) e
# espinhos no topo — perfil por variante via random.Random(seed fixa).

SS = 4  # superscale
SW, SH = 256, WALL_CELL_H * SS  # 256 x 344
EXTRUDE = 120
DIAMOND_H = 128
TOP_Y = SH - EXTRUDE - DIAMOND_H  # y do centro-topo do losango superior

OBS_DARK = (16, 12, 24)
OBS_LEFT = (28, 20, 44)
OBS_RIGHT = (44, 32, 66)
OBS_TOP = (58, 44, 86)
VEIN = (146, 90, 255)

wall_y = CELL_H * len(ROWS)
for col in range(WALL_VARIANTS):
    rng = random.Random(0x5F + col)  # determinístico por variante
    src = Image.new('RGBA', (SW, SH), (0, 0, 0, 0))
    d = ImageDraw.Draw(src)
    cx = SW // 2
    top_c = (cx, TOP_Y)  # centro do losango do topo
    top_l = (0, TOP_Y + DIAMOND_H // 2)
    top_r = (SW, TOP_Y + DIAMOND_H // 2)
    top_b = (cx, TOP_Y + DIAMOND_H)
    bot_l = (0, top_l[1] + EXTRUDE)
    bot_r = (SW, top_r[1] + EXTRUDE)
    bot_b = (cx, top_b[1] + EXTRUDE)

    # Faces do bloco
    d.polygon([top_l, top_b, bot_b, bot_l], fill=OBS_LEFT)
    d.polygon([top_b, top_r, bot_r, bot_b], fill=OBS_RIGHT)
    d.polygon([top_c, top_r, top_b, top_l], fill=OBS_TOP)

    # Máscara da silhueta: facetas e veios não podem vazar do bloco, e veios
    # translúcidos precisam COMPOR sobre a face (ImageDraw substituiria o pixel,
    # deixando o bloco furado — visto no primeiro preview).
    sil = Image.new('L', (SW, SH), 0)
    ds = ImageDraw.Draw(sil)
    ds.polygon([top_l, top_b, bot_b, bot_l], fill=255)
    ds.polygon([top_b, top_r, bot_r, bot_b], fill=255)
    ds.polygon([top_c, top_r, top_b, top_l], fill=255)

    deco = Image.new('RGBA', (SW, SH), (0, 0, 0, 0))
    dd = ImageDraw.Draw(deco)

    # Facetas: lascas triangulares mais escuras/claras nas faces
    for _ in range(7):
        fx = rng.randint(10, SW - 10)
        fy = rng.randint(top_b[1], bot_b[1] - 14)
        w = rng.randint(14, 44)
        h = rng.randint(18, 52)
        shade = OBS_DARK if rng.random() < 0.6 else (OBS_TOP if fx > cx else OBS_LEFT)
        dd.polygon(
            [(fx, fy), (fx + w, fy + h // 2), (fx + rng.randint(-8, 8), fy + h)],
            fill=shade + (255,),
        )

    # Veios arcanos: polilinhas finas roxas descendo as faces
    for _ in range(3):
        vx = rng.randint(20, SW - 20)
        vy = top_b[1] + rng.randint(-30, 10)
        pts = [(vx, vy)]
        while vy < bot_b[1] - 10:
            vx += rng.randint(-14, 14)
            vy += rng.randint(18, 34)
            pts.append((vx, vy))
        dd.line(pts, fill=VEIN + (rng.randint(90, 160),), width=rng.randint(2, 4))

    deco.putalpha(ImageChops.multiply(deco.getchannel('A'), sil))
    src.alpha_composite(deco)

    # Espinhos no topo: agulhas tortas subindo do losango superior
    n_spikes = 3 + col % 2 + rng.randint(0, 2)
    for s in range(n_spikes):
        t = (s + 0.5) / n_spikes
        bx = int(top_l[0] + (top_r[0] - top_l[0]) * t)
        by = int(top_l[1] + (top_b[1] - top_l[1]) * abs(0.5 - t) * 1.4)
        hgt = rng.randint(40, 96)
        lean = rng.randint(-18, 18)
        wid = rng.randint(10, 22)
        tip = (bx + lean, by - hgt)
        d.polygon([(bx - wid, by), tip, (bx + wid, by)], fill=OBS_DARK)
        # gume iluminado do espinho (lado direito pega a luz)
        d.line([tip, (bx + wid, by)], fill=OBS_TOP, width=3)
        if rng.random() < 0.5:
            d.line([tip, ((tip[0] + bx) // 2, by - hgt // 3)], fill=VEIN + (140,), width=2)

    # Contorno de leitura (borda escura do losango do topo)
    d.line([top_l, top_c, top_r], fill=OBS_DARK, width=4)

    mono = src.resize((CELL_W, WALL_CELL_H), Image.LANCZOS)
    atlas.paste(mono, (col * CELL_W, wall_y), mono)

OUT.parent.mkdir(exist_ok=True)
atlas.save(OUT)
print(f'ok {OUT} {atlas.size}')
