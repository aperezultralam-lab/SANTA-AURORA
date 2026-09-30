# Arquitectura — Santa Aurora: Afterlight

## Runtime
Una sola pila de render: **Three.js/WebGL** para escenario, personajes, rostros, criaturas, partículas y UI 3D. No se utiliza un motor externo separado para generar caras.

## Módulos lógicos actuales
- Player Controller: movimiento, sprint, crouch, dodge, salto/vault básico, cámara shoulder.
- Combat: melee, apuntado y disparo limitado.
- Interaction: pickups, documentos y objetos de misión.
- Inventory/Crafting: mochila limitada, botiquines, cuchillas y recursos.
- AI: patrulla, investigación, sospecha, persecución y combate.
- Creature AI: criatura original con hearing/vision distintos.
- Mission State: objetivos secuenciales y final de vertical slice.
- Narrative: cinemática breve, documentos y radio.
- Performance: presets, resolución dinámica, LOD por distancia, partículas adaptativas.
- Persistence: guardado local versionado.
- Input: teclado/mouse, touch y gamepad.

## Expansión
Separar posteriormente en ES modules:
```
src/
  core/
  player/
  combat/
  ai/
  world/
  missions/
  inventory/
  audio/
  ui/
  persistence/
```

## Zonas
La vertical slice combina Centro Urbano, Suburbios, Hospital, Estación Inundada, Bosque Periférico y Centro Comercial dentro de un mapa compacto conectado.
