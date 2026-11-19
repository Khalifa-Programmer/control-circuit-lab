# Control Circuit Lab

Draw electrical control and power circuits in the browser and run them as a live simulation, with breakers, overloads, timers, motors and a small ladder-programmed PLC. Projects are private to each member; finished circuits can be shared in the organisation's gallery.

Inspired by https://classic-control-simulator.app

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Draw circuits from a categorised parts library, wire terminals, label parts and set ratings, coil voltages, delays and curves.
- Simulate live: press buttons, watch phases, coils, lamps, motors (direction, star/delta) and timers, with trips, faults and warnings.
- Program a PLC with 8 inputs and 4 outputs in a ladder editor with contacts, coils, set/reset, timers and counters.
- Open ready-made example circuits as your own projects and follow ordered lessons that link to them.
- Keep projects with several named diagrams: create, rename, duplicate, reorder and delete.
- Publish diagrams to a shared gallery, search and sort it, vote, simulate posts and copy them.
- Export a diagram as a project file, PNG, SVG or PDF, and import a project file as a new diagram.

Left out: accounts and sign-in, which your Gateway handles; the Android app; the variable frequency drive and PLC expansion module; languages other than English.

## Setup

- Install: `pnpm install`
- Run locally: `pnpm dev`
- Test: `pnpm test` (simulation and ladder unit tests); the release checks are in `checks/`.
- Deploy: `pnpm run deploy` behind your EveryApp Gateway.

The app needs no secrets or settings: it uses one D1 database, created on deploy.

## Limitations

- The simulation is a teaching model: it shows logic, phases, currents and trips, not exact electrical values.
- One PLC per diagram is simulated.
- An open editor saves only over the version it loaded; if the same diagram is changed in another tab, reload before editing.
