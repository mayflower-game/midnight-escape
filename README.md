# Midnight Escape

A browser-based, real-time asymmetric multiplayer horror game. A host creates a five-character room code; friends join without accounts. Rooms hold 2–6 survivors and one monster player.

## Run locally

Use Node.js 22 or newer and pnpm 11.25.

1. Install dependencies: pnpm install --config.block-exotic-subdeps=false
2. Start the Colyseus server in one terminal: pnpm server
3. Start the web client in another terminal: pnpm dev
4. Open the Vite URL shown in the terminal.
5. To run the multiplayer end-to-end check, keep the server running and run pnpm test:multiplayer in another terminal.

The client connects to http://localhost:2567 while running locally. Production uses a single HTTPS origin for the website and secure WebSockets.

## Play

- Create a room and share its five-character code. At least three people are required to start.
- Survivors use WASD or the phone joystick. Hold Shift or RUN to move faster. Press E or USE beside a key, clue, or exit. F / LIGHT toggles the flashlight.
- The monster is assigned at random and sees survivor positions. Get within pounce range and press Space, E, or POUNCE.
- Survivors read the note to reveal the exit and the three keys needed for that round. Collected keys are shared by the survivor team.
- Caught survivors can spectate. The survivors win if at least one escapes; the monster wins if it catches everyone or no one escapes before time runs out.
- The host can start a new round from the results screen. Roles rotate when possible.

The server owns movement, collisions, item collection, captures, roles, and the timer. It filters snapshots by role so survivors do not receive the monster's location before the round ends.

## Public deployment

The project includes render.yaml for a single Render web service. It builds the browser client, serves it from the game server, exposes the health endpoint, and supports the Colyseus WebSocket connection.

To publish:

1. Put this project in a GitHub repository.
2. Sign in to Render and choose New → Blueprint.
3. Connect the repository and apply the render.yaml Blueprint.
4. Choose the Free service plan and wait for the build to finish.
5. Share the generated onrender.com URL.

The free service sleeps after 15 minutes without traffic and takes about a minute to wake on the next visit. Upgrade to a paid service if you need it to stay warm.

No game-specific secrets, database, or account system are needed. Render requires a connected account and a repository it can read. The public URL is created after that deployment completes.


