export interface Lesson {
  slug: string;
  title: string;
  paragraphs: string[];
  /** Examples the lesson builds on. */
  examples: string[];
}

export const LESSONS: Lesson[] = [
  {
    slug: "first-circuit",
    title: "Your first circuit",
    paragraphs: [
      "Every circuit starts at a supply. The three-phase supply gives three line conductors (L1, L2, L3) with 400 V between any two of them, a neutral (N) with 230 V to each line, and protective earth (PE).",
      "Add a supply, a 1-pole breaker, a normally open push button and a pilot lamp. Click a terminal, then another, to draw a wire: L1 to the breaker, the breaker to the button, the button to lamp X1, and lamp X2 back to N.",
      "Press Simulate and hold the button. Live conductors take the colour of their phase, and the lamp lights while the button is held.",
    ],
    examples: [],
  },
  {
    slug: "hold-in-contact",
    title: "Start, stop and the hold-in contact",
    paragraphs: [
      "A contactor is a switch worked by a coil (A1–A2). Its main poles carry the motor current; its auxiliary contacts carry control signals.",
      "A momentary start button would drop the contactor as soon as it is released. Wiring the contactor's own normally open contact (13–14) across the start button keeps the coil fed: the circuit holds itself in until the normally closed stop button breaks it.",
      "The overload relay's 95–96 contact sits in the same line, so a trip stops the motor the same way the stop button does.",
    ],
    examples: ["dol-start", "multi-location"],
  },
  {
    slug: "protection",
    title: "Breakers, overloads and earth leakage",
    paragraphs: [
      "A miniature breaker trips instantly once the current passes a multiple of its rating set by its curve: about 5× for B, 10× for C and 20× for D. A motor's starting current is around six times its running current, which is why motor circuits use C or D curves. Smaller overcurrents trip it after a while.",
      "The thermal overload relay is set to the motor's rated current. It ignores the short starting surge but trips when a jammed or overloaded motor draws too much for too long, and it stays tripped until it is reset by hand.",
      "A short circuit trips the breaker nearest to the fault, leaving the rest of the installation running. An RCD trips when current leaks to earth, which the simulator lets you cause on any lamp or motor.",
    ],
    examples: ["alarm-protection", "dol-start"],
  },
  {
    slug: "interlocks",
    title: "Reversing and interlocks",
    paragraphs: [
      "Swapping any two phases reverses a three-phase motor. Two contactors do it, one feeding L1-L2-L3 and the other L3-L2-L1.",
      "If both closed together they would short two phases. Each contactor's normally closed contact (21–22) in the other's coil line makes that impossible: this is an electrical interlock.",
    ],
    examples: ["forward-reverse"],
  },
  {
    slug: "star-delta",
    title: "Star-delta starting",
    paragraphs: [
      "A motor started in star sees 230 V per winding instead of 400 V and draws about a third of the direct-on-line starting current. Once it is up to speed it is switched to delta for full power.",
      "Three contactors do it: the main contactor, a star contactor that ties the winding ends together, and a delta contactor that links each winding end to the next phase. Star and delta are interlocked; a timer or a second button switches between them.",
    ],
    examples: ["star-delta-manual", "star-delta-auto", "timer-control"],
  },
  {
    slug: "automatic-control",
    title: "Sensors and automatic changeover",
    paragraphs: [
      "Level, pressure and temperature switches are contacts worked by the process instead of a hand. A pump fills a tank while the level switch reads low; a fan runs while a thermostat reads hot.",
      "A phase monitor checks that all three phases are present and in the right order. Its contact can hand a load to a generator when the mains fails and give it back when the mains returns.",
    ],
    examples: ["liquid-level", "pressure-control", "temperature-control", "mains-generator"],
  },
  {
    slug: "plc-basics",
    title: "From relays to a PLC",
    paragraphs: [
      "A PLC replaces hard-wired logic with a program. Buttons and sensors are wired to its inputs (I1–I8); its outputs (Q1–Q4) are relay contacts that switch lamps and contactor coils.",
      "The program is a ladder: each rung is contacts in series (and) and in parallel branches (or) driving a coil. Memory bits (M), timers (T) and counters (C) hold state between scans. The start/stop example is the hold-in circuit written as one rung.",
    ],
    examples: ["plc-start-stop"],
  },
];

export const LESSON_BY_SLUG: Record<string, Lesson> = Object.fromEntries(LESSONS.map((l) => [l.slug, l]));
