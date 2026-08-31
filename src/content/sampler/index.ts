import type { Category } from '../types';

/**
 * The shipped starter content.
 *
 * Four artworks in one subject category, exercising the same path a loaded pack
 * takes: the images sit in `public/artwork/` and are referenced by URL, so
 * their palettes are extracted at play time by the ordinary pipeline with no
 * special case for being built in.
 *
 * Boards are assigned explicitly rather than left to the id-hash in
 * `specFor`, so the four read as four different puzzles: a plain square grid,
 * a circle of hexagons, a rounded field of diamonds, and a hexagon of
 * hexagons. Difficulty ramps across the category, and the widest-hue artwork
 * is placed last where it can carry the most tiles.
 */

export const SAMPLER_CATEGORIES: Category[] = [
  {
    id: 'cosmos',
    title: 'The Cosmos',
    blurb: 'Deep space, and the physics that shapes it.',
    subjects: [
      {
        id: 'spiral-galaxy',
        title: 'Spiral Galaxy',
        blurb: 'A hundred billion suns, held in a turning disc.',
        difficulty: 'easy',
        latticeKind: 'square',
        shape: 'full',
        artwork: { kind: 'url', url: './artwork/spiral-galaxy.jpg' },
        facts: [
          'A spiral galaxy’s arms look blue and its centre gold for the same reason: the arms are where new stars are still forming, and the hottest, bluest of those burn out fastest, while the core is left holding older, cooler, redder ones.',
          'Spiral arms are not solid structures that wind up over time. They are density waves — stars drift into them and out again, the way a traffic jam persists on a motorway while individual cars pass through it.',
          'The Milky Way is a barred spiral roughly 100,000 light years across. Every picture you have seen of it from the outside is an illustration, because nothing has ever been far enough away to take that photograph.',
          'Galaxies are mostly empty space. When Andromeda meets the Milky Way in about four billion years, the two will pass through each other with almost no stars colliding.',
          'Counts of how many galaxies fill the observable universe have ranged from a few hundred billion to two trillion, depending on how many of the faintest ones a survey can pick out.',
        ],
      },
      {
        id: 'saturn',
        title: 'Saturn',
        blurb: 'The solar system’s great ringed world.',
        difficulty: 'medium',
        latticeKind: 'hex',
        shape: 'circle',
        artwork: { kind: 'url', url: './artwork/saturn.jpg' },
        facts: [
          'Saturn’s rings are almost entirely water ice, in pieces ranging from specks of dust to chunks the size of a house.',
          'The rings span about 280,000 km but are only tens of metres thick through most of that. Scaled to the width of a football pitch, they would be thinner than a sheet of paper.',
          'They may be young. Measurements from the Cassini mission suggest the rings formed perhaps 10 to 100 million years ago — long after the first dinosaurs.',
          'Saturn is less dense than water. Given an ocean big enough to hold it, the planet would float.',
          'All four giant planets have rings. Saturn’s are simply the only ones bright enough to pick out through a small telescope.',
        ],
      },
      {
        id: 'supernova-remnant',
        title: 'Supernova Remnant',
        blurb: 'What a star leaves behind when it dies.',
        difficulty: 'medium',
        latticeKind: 'diamond',
        shape: 'squircle',
        artwork: { kind: 'url', url: './artwork/supernova-remnant.jpg' },
        facts: [
          'A supernova can briefly outshine its entire galaxy: one dying star out-glowing a hundred billion others.',
          'Most of the elements heavier than iron were forged in violent stellar events like this one and flung outward. The calcium in your bones and the iron in your blood were made inside stars.',
          'The expanding shell is not moving into emptiness. It slams into the gas already there and lights it up, which is why remnants look like tangled filaments rather than clean bubbles.',
          'The supernova that made the Crab Nebula was recorded by Chinese astronomers in 1054, and was bright enough to be seen in broad daylight for more than three weeks.',
          'What is left at the centre can be a neutron star, so dense that a piece the size of a sugar cube would weigh about as much as a mountain.',
        ],
      },
      {
        id: 'black-hole',
        title: 'Black Hole',
        blurb: 'Where gravity closes the last way out.',
        difficulty: 'hard',
        latticeKind: 'hex',
        shape: 'hexagon',
        artwork: { kind: 'url', url: './artwork/black-hole.jpg' },
        facts: [
          'A black hole is less an object than a place: a region where gravity has closed off every path leading back out, including the ones light would take.',
          'The event horizon is a boundary, not a surface. Falling through a large one there is no wall and no jolt — nothing nearby marks the moment you can no longer return.',
          'The glow in an image of a black hole is not the hole. It is the accretion disk: matter torn apart and heated to millions of degrees as it spirals inward.',
          'The first direct image of a black hole’s shadow was published in 2019, showing the giant at the centre of the galaxy M87.',
          'Black holes are not permanent. Hawking radiation means they slowly leak energy and will eventually evaporate, though a star-sized one would outlast the present age of the universe many times over.',
        ],
      },
    ],
  },
];
