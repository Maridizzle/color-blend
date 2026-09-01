import type { Category } from '../types';

/**
 * The shipped starter content: twenty artworks across two categories.
 *
 * The images sit in `public/artwork/` and are referenced by URL, so their
 * palettes are extracted at play time by the ordinary pipeline with no special
 * case for being built in -- the same path a loaded pack takes.
 *
 * Boards are left to `specFor`, which walks the lattice and shape lists by
 * position so twenty subjects come out visibly different from each other, and
 * ramps difficulty across each category.
 *
 * `hue` is the one thing set here rather than derived, and it is not a taste
 * decision: fourteen of these twenty images have a dominant hue between 43 and
 * 87 degrees, because lit dust and starlight are warm. Left alone almost every
 * board would be the same amber. The values below were computed by
 * `assignDistinctHues` in `src/content/hues.ts` over all twenty at once, which
 * spaces them 18 degrees apart around the wheel and gives each artwork the slot
 * closest to a colour it actually contains. They are recorded rather than
 * recomputed at load time because working them out means clustering twenty
 * images, and nobody should wait for that to open a menu. A pack loaded from a
 * zip runs the same function during ingest, where the palettes are already in
 * hand.
 *
 * The split into two categories is about the facts, not the pictures. Half
 * these images are astronomical objects and can carry astronomy; the rest are
 * human-scale scenes -- figures under strange skies, machines, ruins -- where a
 * fact about spiral arms would be pasted on. Those get a category about scale,
 * deep time and what we are made of, which is what they are actually about.
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
        hue: 272,
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
        id: 'andromeda',
        title: 'Andromeda',
        blurb: 'The nearest big galaxy, and the furthest thing you can see unaided.',
        hue: 326,
        artwork: { kind: 'url', url: './artwork/andromeda.jpg' },
        facts: [
          'Andromeda is about 2.5 million light years away, and is the most distant object most people can see with the naked eye. The light reaching you tonight left before our species existed.',
          'Until the 1920s it was called the Andromeda Nebula and assumed to be a cloud inside our own galaxy. Edwin Hubble found variable stars in it, measured the distance, and moved it outside.',
          'It is coming towards us at about 110 km per second. In roughly four billion years the two galaxies will merge.',
          'It spans about six times the width of the full Moon in our sky. We only ever notice the bright core, because everything outside it is too faint for the eye to pick up.',
          'It may hold around a trillion stars, several times the Milky Way’s count, while being no more massive overall — a difference in how the mass is divided up rather than how much there is.',
        ],
      },
      {
        id: 'pinwheel-galaxy',
        title: 'Pinwheel Galaxy',
        blurb: 'Two clean arms, which is rarer than it looks.',
        hue: 290,
        artwork: { kind: 'url', url: './artwork/pinwheel-galaxy.jpg' },
        facts: [
          'A “grand design” spiral has two clear arms running unbroken around the disc. Only about one spiral in ten is this tidy; the rest are flocculent — patchy and many-armed.',
          'The pink knots strung along the arms are clouds of hydrogen lit from inside by newborn stars. They mark where the galaxy is still building.',
          'Clean arms are often somebody else’s doing. A close pass by a neighbouring galaxy can pull a ragged disc into a symmetrical spiral.',
          'Blue light in the arms comes from stars a few million years old. The yellow core is stars billions of years old. You are looking at two very different ages in one picture.',
          'The disc is astonishingly thin. The Milky Way is about 100,000 light years across and only around 1,000 thick — proportionally thinner than a sheet of paper is wide.',
        ],
      },
      {
        id: 'barred-spiral',
        title: 'Barred Spiral',
        blurb: 'A straight span of stars across the core, with the arms trailing from its ends.',
        hue: 254,
        artwork: { kind: 'url', url: './artwork/barred-spiral.jpg' },
        facts: [
          'Roughly two thirds of spiral galaxies have a bar — a straight structure through the centre, with the spiral arms starting at its tips rather than at the core.',
          'The bar works as a funnel. It channels gas inward, feeding bursts of star formation and sometimes the black hole at the centre.',
          'The Milky Way has one, and we only established that in the 1990s. Mapping a structure you are sitting inside is genuinely hard.',
          'Bars are not permanent. They form, strengthen and can dissolve again over billions of years, so a galaxy may be barred for only part of its life.',
          'A bar is a resonance, not an object: the stars in it are on elongated orbits that happen to line up, and individual stars pass through and out again.',
        ],
      },
      {
        id: 'galaxy-cluster',
        title: 'Galaxy Cluster',
        blurb: 'The largest things gravity has managed to hold together.',
        hue: 344,
        artwork: { kind: 'url', url: './artwork/galaxy-cluster.jpg' },
        facts: [
          'A rich cluster can hold a thousand galaxies bound together by gravity. They are the largest structures in the universe that are held together at all — everything bigger is still expanding apart.',
          'Most of a cluster’s ordinary matter is not in the galaxies. It is thin gas between them, heated to tens of millions of degrees and glowing in X-rays.',
          'Clusters bend the light of whatever lies behind them, magnifying distant galaxies into arcs. The same effect weighs the cluster, because the bending depends on its mass.',
          'Those weighings are a large part of how we know most of the mass in the universe is something we cannot see directly.',
          'Cluster galaxies harass each other. Close passes and the pressure of that hot gas strip a galaxy of its own, which shuts down its star formation and leaves it red.',
        ],
      },
      {
        id: 'saturn',
        title: 'Saturn',
        blurb: 'The solar system’s great ringed world.',
        hue: 20,
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
        id: 'gas-giant-clouds',
        title: 'Cloud Tops',
        blurb: 'A world with weather and no ground.',
        hue: 74,
        artwork: { kind: 'url', url: './artwork/gas-giant-clouds.jpg' },
        facts: [
          'A gas giant has no surface. Descending, the atmosphere simply thickens until it behaves as a liquid, and there is no line anywhere to call the ground.',
          'Jupiter’s bands are jet streams, and neighbouring bands run in opposite directions. The curls between them are where those opposing winds shear against each other.',
          'Hydrogen and helium are colourless, so none of the colour comes from the bulk of the planet. It comes from traces — ammonia ice, ammonium hydrosulfide, and compounds still not firmly identified.',
          'The Great Red Spot is a storm wider than Earth that has been watched continuously for around 190 years. It has been shrinking for most of the time we have measured it.',
          'The fastest winds in the solar system, roughly 2,000 km/h, blow on Neptune — the planet that receives the least sunlight of any of them.',
        ],
      },
      {
        id: 'crab-nebula',
        title: 'The Crab Nebula',
        blurb: 'Wreckage from an explosion people watched in 1054.',
        hue: 218,
        artwork: { kind: 'url', url: './artwork/crab-nebula.jpg' },
        facts: [
          'The Crab is the debris of a star seen to explode in 1054. Chinese astronomers recorded a “guest star” bright enough to be visible in daylight for over three weeks.',
          'At its centre is a pulsar: a neutron star spinning about 30 times a second, sweeping a beam past us like a lighthouse.',
          'That neutron star is roughly 20 km across and heavier than the Sun. A teaspoon of its material would weigh about as much as a mountain.',
          'The nebula is still flying apart at around 1,500 km per second, and it is measurably larger in photographs taken decades apart.',
          'Much of its glow is not from hot gas but from electrons spiralling through a magnetic field at nearly the speed of light.',
        ],
      },
      {
        id: 'supernova-remnant',
        title: 'Supernova Remnant',
        blurb: 'What a star leaves behind when it dies.',
        hue: 38,
        artwork: { kind: 'url', url: './artwork/supernova-remnant.jpg' },
        facts: [
          'A supernova can briefly outshine its entire galaxy: one dying star out-glowing a hundred billion others.',
          'The expanding shell is not moving into emptiness. It slams into the gas already there and lights it up, which is why remnants look like tangled filaments rather than clean bubbles.',
          'Elements heavier than iron cannot be made by ordinary fusion. They need the energy of an explosion like this one.',
          'The shock front can trigger the collapse of nearby gas clouds, so one star’s death starts the next generation’s birth.',
          'A remnant stays visible for tens of thousands of years before it thins out and merges with the interstellar medium.',
        ],
      },
      {
        id: 'accretion-disc',
        title: 'Accretion Disc',
        blurb: 'Matter falling in, and glowing on the way down.',
        hue: 92,
        artwork: { kind: 'url', url: './artwork/accretion-disc.jpg' },
        facts: [
          'Material falling towards a compact object almost never falls straight in. It arrives with sideways motion, so it settles into a disc and spirals inward instead.',
          'Friction within the disc heats it to millions of degrees. That is why accretion discs shine, often outshining everything else in the neighbourhood.',
          'Accretion is the most efficient energy source known. Falling into a spinning black hole can release tens of per cent of a mass as energy; hydrogen fusion manages under one per cent.',
          'The same physics builds planets. A young star’s disc is far cooler, so instead of blazing, its dust sticks together.',
          'Quasars are accretion discs around supermassive black holes, and are among the brightest sustained objects in the universe.',
        ],
      },
      {
        id: 'black-hole',
        title: 'Black Hole',
        blurb: 'A boundary in spacetime, not an object.',
        hue: 2,
        artwork: { kind: 'url', url: './artwork/black-hole.jpg' },
        facts: [
          'The glow in an image of a black hole is not the hole. It is the accretion disk: matter torn apart and heated to millions of degrees as it spirals inward.',
          'The event horizon is a boundary, not a surface. Falling through a large one there is no wall and no jolt — nothing nearby marks the moment you can no longer return.',
          'The first direct image of a black hole’s shadow was published in 2019, showing the giant at the centre of the galaxy M87.',
          'Supermassive black holes sit at the centre of most large galaxies, including ours. The Milky Way’s is about four million times the Sun’s mass.',
          'They are not permanent. Hawking radiation means a black hole slowly evaporates, though a stellar-mass one would take vastly longer than the current age of the universe.',
        ],
      },
    ],
  },
  {
    id: 'our-place',
    title: 'Our Place In It',
    blurb: 'Standing under it, made of it, and trying to reach it.',
    subjects: [
      {
        id: 'meadow-galaxy',
        title: 'Night Over a Meadow',
        blurb: 'The view most people have lost.',
        hue: 56,
        artwork: { kind: 'url', url: './artwork/meadow-galaxy.jpg' },
        facts: [
          'About a third of humanity can no longer see the Milky Way from where they live, and roughly 80% of people in North America cannot.',
          'Your eyes need 20 to 30 minutes to fully dark-adapt, and a single glance at a white light resets most of it.',
          'Look slightly to the side of a faint star and it brightens. The edge of the retina is more sensitive to dim light than the centre, so astronomers deliberately look away from what they want to see.',
          'Under a genuinely dark sky perhaps 3,000 stars are visible at once. From a city centre it can be a few dozen.',
          'Nearly every star you can see unaided lies within about 1,000 light years — a small bubble inside a galaxy 100,000 light years across.',
        ],
      },
      {
        id: 'mountain-night',
        title: 'Peaks Under Starlight',
        blurb: 'Why observatories are built where the air runs out.',
        hue: 110,
        artwork: { kind: 'url', url: './artwork/mountain-night.jpg' },
        facts: [
          'Great telescopes sit on mountains to get above as much of the atmosphere as possible — above its water vapour, and above much of its turbulence.',
          'Stars twinkle because of air, not because of anything the star is doing. Adaptive optics cancels it by flexing a mirror hundreds of times a second to undo the distortion as it happens.',
          'The silicon and oxygen in the rock beneath you and the calcium in your bones were made by the same process, inside stars that died long before the Sun.',
          'Mountains on Earth have a height limit set by gravity: pile rock higher and the base begins to flow. Olympus Mons on Mars is around two and a half times the height of Everest, because Mars pulls less hard.',
          'The darkest skies left on Earth are mostly at altitude or at sea, and a growing number of them are formally protected as dark-sky reserves.',
        ],
      },
      {
        id: 'cloud-sea',
        title: 'Above the Clouds',
        blurb: 'How thin the air actually is.',
        hue: 200,
        artwork: { kind: 'url', url: './artwork/cloud-sea.jpg' },
        facts: [
          'In photographs of Earth from orbit the atmosphere is a thin bright line. Most of its mass sits within about 16 km of the ground — thinner, proportionally, than the skin on an apple.',
          'Space is usually reckoned to begin at the Kármán line, 100 km up, where the air is so thin you would need to fly faster than orbital speed for wings to hold you.',
          'Clouds are not water vapour. Vapour is an invisible gas; a cloud is liquid droplets or ice crystals that have condensed out of it.',
          'A moderate cumulus cloud can carry hundreds of tonnes of water and still float, because the air it displaces weighs more than it does.',
          'The blue of the sky is sunlight scattered by air molecules, which deflect short wavelengths far more strongly than long ones. With no air, the daytime sky is black.',
        ],
      },
      {
        id: 'the-ascent',
        title: 'The Ascent',
        blurb: 'Leaving is a problem of speed, not height.',
        hue: 164,
        artwork: { kind: 'url', url: './artwork/the-ascent.jpg' },
        facts: [
          'Reaching orbit is about going sideways fast enough — roughly 28,000 km/h — not about going up. Straight up and you simply come back down.',
          'Most of a rocket on the pad is fuel. Around 85 to 90% of its mass is propellant, and only a few per cent is payload.',
          'That is the rocket equation biting: every extra kilogram of fuel needs more fuel to lift it, so the cost of a bit more speed rises steeply.',
          'Orbit is falling. A spacecraft in free fall around Earth is accelerating downward the whole time; it simply moves sideways fast enough to keep missing.',
          'Coming back is the harder half. Re-entry has to shed all that speed as heat, which is why heat shields, not engines, are the critical part.',
        ],
      },
      {
        id: 'alien-sky',
        title: 'Another World’s Sky',
        blurb: 'Daylight elsewhere probably looks nothing like ours.',
        hue: 236,
        artwork: { kind: 'url', url: './artwork/alien-sky.jpg' },
        facts: [
          'More than five thousand planets around other stars have been confirmed, and most were found without ever being seen — detected by the tiny dip in a star’s light as a planet crosses in front of it.',
          'Sky colour depends on the air. Mars has a butterscotch day sky and a blue sunset, the reverse of Earth’s, because its dust scatters light the opposite way round.',
          'Many stars come in pairs or more, so a double sunset is an ordinary sight in the galaxy rather than an exotic one.',
          'Red dwarfs are by far the most common kind of star, so the most common daylight in the universe is probably dim and red.',
          'A planet orbiting close to a small star tends to become tidally locked, keeping one face towards it permanently: endless day on one side, endless night on the other.',
        ],
      },
      {
        id: 'young-sun',
        title: 'A Sun Being Born',
        blurb: 'Where planets come from.',
        hue: 128,
        artwork: { kind: 'url', url: './artwork/young-sun.jpg' },
        facts: [
          'Stars form inside cold clouds of gas and dust that collapse under their own gravity until the centre is hot and dense enough for fusion to start.',
          'The leftover material forms a disc, and planets condense out of it. That is why the planets of our solar system all orbit in nearly the same plane and the same direction.',
          'A Sun-like star takes around ten million years to settle into stable hydrogen burning, and then stays there for roughly ten billion.',
          'A newborn star blows a fierce wind that clears out the nursery around it, which is part of why young clusters of stars drift apart rather than staying together.',
          'The Sun is roughly a third brighter now than when Earth formed, and will keep brightening. Life has spent four billion years under a slowly rising light.',
        ],
      },
      {
        id: 'star-stuff',
        title: 'Star Stuff',
        blurb: 'You are made of the ash.',
        hue: 308,
        artwork: { kind: 'url', url: './artwork/star-stuff.jpg' },
        facts: [
          'Every element heavier than helium was assembled inside a star, or in the collision of two dead ones. There is no other significant source.',
          'The calcium in your bones and the iron in your blood were made in stars that finished burning before the Sun existed.',
          'The hydrogen in you is older still. It was made in the first few minutes after the Big Bang and has never been made in quantity since.',
          'Gold and platinum need something more violent than an ordinary star. Much of it appears to come from neutron stars colliding.',
          'By mass a human body is around 65% oxygen and 18% carbon. Both are stellar ash, which makes most of you, quite literally, the remains of stars.',
        ],
      },
      {
        id: 'the-machine',
        title: 'The Machine',
        blurb: 'Almost everything we know, something else went and looked at.',
        hue: 146,
        artwork: { kind: 'url', url: './artwork/the-machine.jpg' },
        facts: [
          'Nearly everything known about other worlds was sent back by robots. No human being has yet travelled further than the Moon.',
          'Voyager 1, launched in 1977, is the most distant human-made object. Its radio signal now takes around a day to make the round trip.',
          'Spacecraft computers are deliberately decades behind consumer hardware. Radiation-hardened chips are slow, and out there reliability beats speed every time.',
          'Mars rovers are not driven with a joystick. The round-trip light delay runs from about 8 to 40 minutes, so each day’s driving is sent up as a script and executed alone.',
          'Voyager carries a gold-plated record of sounds and images from Earth, aimed at nobody in particular, on the chance that something eventually finds it.',
        ],
      },
      {
        id: 'the-ruins',
        title: 'What We Leave',
        blurb: 'The orbits are getting crowded.',
        hue: 182,
        artwork: { kind: 'url', url: './artwork/the-ruins.jpg' },
        facts: [
          'Tens of thousands of debris objects larger than 10 cm are tracked in orbit around Earth, and there are many millions too small to track but still fast enough to destroy a satellite.',
          'A collision in orbit makes debris that causes further collisions. Run far enough, that cascade — Kessler syndrome — could make some orbits unusable for generations.',
          'Altitude decides how long junk lasts. Below about 600 km the thin remaining air drags things down within decades; above 1,000 km, objects can stay up for centuries.',
          'Debris hits at closing speeds around 10 km per second, where a fleck of paint carries the energy of a bullet.',
          'The footprints left on the Moon have no wind or water to erase them. Barring an unlucky impact, they will still be there in a million years.',
        ],
      },
    ],
  },
];
