import type { Category } from '../types';
import { drawAurora, drawCopperCrystal, drawCoralReef, drawDesertDunes } from './draw';

/**
 * The shipped sampler content.
 *
 * Two categories on purpose, matching the two the game is aimed at -- walking a
 * subject like the periodic table or the world's biomes -- so the category
 * structure is exercised rather than assumed. Delete this module once real
 * packs land; nothing else imports from it except the category registry.
 */

export const SAMPLER_CATEGORIES: Category[] = [
  {
    id: 'biomes',
    title: "The World's Biomes",
    blurb: 'Habitats and the light that falls on them.',
    subjects: [
      {
        id: 'coral-reef',
        title: 'Coral Reef',
        blurb: 'Tropical shallows, built by animals the size of a pinhead.',
        difficulty: 'easy',
        latticeKind: 'square',
        shape: 'full',
        artwork: { kind: 'drawn', draw: drawCoralReef },
        facts: [
          'Reefs cover under 1% of the ocean floor but shelter around a quarter of all marine species.',
          'Coral is an animal, a plant, and a rock at once: a colony of polyps farming algae inside a limestone skeleton it built itself.',
          'The algae living inside coral tissue give it its color. A stressed reef expels them and turns bone white, which is what bleaching means.',
          'The Great Barrier Reef is roughly 2,300 km long and is visible from orbit.',
          'Reef-building corals need light, so they grow almost entirely in the sunlit top 50 metres of water.',
        ],
      },
      {
        id: 'aurora-tundra',
        title: 'Arctic Tundra',
        blurb: 'Frozen ground, and a sky that answers the sun.',
        difficulty: 'medium',
        latticeKind: 'hex',
        shape: 'circle',
        artwork: { kind: 'drawn', draw: drawAurora },
        facts: [
          'Tundra soil stays frozen year-round below the surface. That permafrost locks up roughly twice as much carbon as the atmosphere holds.',
          'The aurora is solar wind striking the upper atmosphere; green comes from oxygen at about 100 km up, red from oxygen much higher still.',
          'Almost no trees grow on tundra. The growing season is too short and the frozen subsoil blocks deep roots.',
          'Tundra plants are mostly mosses, lichens and dwarf shrubs, and some lichens grow less than a millimetre a year.',
        ],
      },
      {
        id: 'desert-dunes',
        title: 'Sand Desert',
        blurb: 'Where water leaves and the wind does the sculpting.',
        difficulty: 'medium',
        latticeKind: 'diamond',
        shape: 'squircle',
        artwork: { kind: 'drawn', draw: drawDesertDunes },
        facts: [
          'A desert is defined by dryness, not heat: any place receiving under about 250 mm of rain a year qualifies. Antarctica is the largest.',
          'Only about a fifth of the world’s deserts are covered in sand. Most are rock and gravel.',
          'Dunes migrate. Wind pushes sand up the gentle windward face and it avalanches down the steep leeward side, moving the whole dune downwind.',
          'Desert sand can swing more than 40°C between afternoon and dawn, because dry air holds almost no heat overnight.',
        ],
      },
    ],
  },
  {
    id: 'periodic-table',
    title: 'The Periodic Table',
    blurb: 'The elements, and the colors they wear.',
    subjects: [
      {
        id: 'copper',
        title: 'Copper',
        blurb: 'Element 29. One of the few metals with a color of its own.',
        difficulty: 'medium',
        latticeKind: 'hex',
        shape: 'hexagon',
        artwork: { kind: 'drawn', draw: drawCopperCrystal },
        facts: [
          'Copper and gold are the only two metals with a color other than grey or silver. Both get it from how their electrons absorb blue light.',
          'Copper has been worked for over 10,000 years, long enough that an entire archaeological age is named after its alloy with tin: bronze.',
          'It is the second-best electrical conductor of all metals after silver, which is why nearly every wire in your home is copper.',
          'Weathered copper turns green. That patina is a copper carbonate layer, and it protects the metal underneath rather than eating it.',
          'Your body needs copper to make red blood cells, though only about 1.4 mg a day.',
        ],
      },
    ],
  },
];
