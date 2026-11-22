# Ludo Party – لودو بارتي

A premium, mobile-first **online multiplayer Ludo** game. Arabic (RTL) is the default language, English is optional.
Built with **Node.js + Express + Socket.IO** and plain HTML/CSS/JavaScript – no frontend framework, no database, no build step.

## Run it

```bash
npm install
npm start
```

Open <http://localhost:3000>. To play with friends on the same Wi-Fi open `http://<your-computer-ip>:3000` on their phones.
The server reads the `PORT` environment variable and binds to `0.0.0.0`, so it works on common free Node.js hosts
(Render, Railway, Fly, Koyeb, Glitch, EthioDeploy, …): build command `npm install`, start command `npm start`.

Run the automated tests (rules + a real 4-player Socket.IO game):

```bash
npm test
```

## How to play

1. Press **العب الآن / Play now** (or **Create room**) – you get a 5-character room code and an invite link.
2. Friends press **Join**, type the code (or open the link) and pick a free colour.
3. Guests press **I'm ready**; the host presses **Start** (2–4 players).
4. Roll the dice, then tap a glowing token (or its dotted target) to move it. First to bring all four tokens home wins.

### Rules implemented (server-enforced)
- 4 tokens per player, a **six** is needed to leave the base.
- **Extra turn** for a six, for capturing a token and for bringing a token home (capture / home bonuses can be switched off by the host in the lobby). **Three sixes in a row forfeit the turn.**
- Exact roll needed to finish; tokens cannot overshoot the centre.
- Landing on an opponent captures it (back to base) **except on safe cells** (the 4 start cells and the 4 star cells).
- Tokens on a private home lane can never be captured. First player to finish all 4 tokens wins.
- If nobody can move, the turn passes automatically.

## Features
- **Real-time 3D board (Three.js)**: tilted camera with perspective, beveled instanced tiles, recessed bases, glossy lathe-turned pawns with clear-coat reflections, gold medal centre, real shadows, studio lighting and particle effects. The camera orbits so **your colour is always bottom-left**.
- **Physical 3D dice** thrown onto the table: it flies in, bounces and tumbles, and always settles on the exact value rolled by the server. Tap the dice or the Roll button.
- **Cinematic moments**: pawns hop cell by cell with squash & stretch, captured pawns are launched back to their base with a burst and camera shake, pawns finishing release gold sparks, the winner's pawns celebrate.
- **Graphics tiers**: Auto / High / Medium / Low / 2D classic (Settings). Auto picks a tier from the device, **lowers the tier by itself if the frame rate drops**, and falls back to the 2D board if WebGL is unavailable or the GPU context is lost.
- **2D classic board**: the original SVG board (beveled tiles, glossy pawns) is kept for old devices and as a fallback.
- **3D dice** that tumbles and lands on the real server-rolled value.
- **Board rotation**: your colour is always at the bottom-left, like commercial Ludo games (toggle in settings).
- **Bots**: the host can fill empty seats with bots (play alone or with fewer friends). Bots use a simple strategy (capture, finish, stay safe).
- **Turn timer** (off / 15 / 30 / 45 s) with a countdown ring around the avatar. If a player times out twice they are put on auto-pilot until they act again.
- **Room rules** chosen by the host: timer, extra turn on capture, extra turn on reaching home.
- **Auto-move** when there is only one meaningful choice (toggle in settings).
- **Quick chat** phrases (Arabic / English) next to the emoji reactions.
- **Private chat (free, no external service)**: a text chat inside each room, plus **whispers** (a private message that only the chosen player receives). Open it from the reactions panel in a match or from the lobby header; unread messages show a badge and a preview toast. Features: recipient chips, per-player **mute**, the **host can switch chat off** for the room, messages are plain text only (never HTML), capped at 200 characters, rate-limited to 5 messages per 6 seconds, invisible/bidi-override characters stripped, and late joiners / reconnecting players receive the history they are allowed to see.
- **Result screen** with ranking and per-player stats (tokens home, captures, sixes) and a personal win counter on the menu.

## Project structure

```
server.js            Authoritative Express + Socket.IO server (rooms, turns, validation)
shared/ludo.js       Rules + board geometry shared by server and client (single source of truth)
public/index.html    All screens (menu, create, join, lobby, game) and modals
public/css/style.css Design system, responsive layouts, animations
public/js/i18n.js    Arabic / English strings, RTL switching
public/js/board3d.js Three.js 3D board, physical dice, camera, particles, quality tiers
public/js/board.js   2D SVG board renderer (classic mode / fallback)
public/vendor/       three.min.js (Three.js r128, MIT license included) – served locally, no CDN
public/js/sound.js   Procedural sound effects & music (WebAudio – no audio files, no licensing issues)
public/js/app.js     Client logic and Socket.IO wiring
test/                rules.test.js, e2e.test.js (real multiplayer games), features.test.js (bots, timer, settings, chat), board3d.test.js (dice orientation + camera rotation math)
```

## Socket.IO protocol (all requests use acknowledgements `{ok, error?}`)

Client → server: `room:create`, `room:peek`, `room:join`, `room:rejoin`, `room:color`, `room:ready`, `room:leave`,
`chat:send {text, to?}`, `chat:history`, `room:settings`, `room:addBot`, `room:removeBot`, `game:start`, `game:roll`, `game:move {token}`, `game:again`, `game:emoji {emoji}`, `game:chat {id}`.
Server → client: `room:state` (full public state, broadcast after every change), `room:notice`, `game:emoji`, `game:chat` (quick phrases), `chat:msg`, `chat:history`.

The server validates room membership, turn, dice state and move legality; clients can never change game state directly.
Dice are rolled on the server with `crypto.randomInt`.

## Reconnection
Each player gets a secret session id kept in `sessionStorage`. After a refresh or a dropped connection the client
re-joins its seat automatically. If the player on turn is offline, the server auto-plays for them after a grace period
so the match never stalls. Abandoned rooms are cleaned up automatically.

## Graphics tiers
| Tier | Shadows | Anti-aliasing | Resolution cap | Reflections |
|---|---|---|---|---|
| High | 2048 soft shadow map | yes | 2x | studio environment + clear-coat |
| Medium | 1024 | yes | 1.5x | studio environment |
| Low | blob shadows | no | 1x | none |
| 2D classic | – | – | – | – (SVG) |

Add `?gfx=high|medium|low|classic` to the URL to force a tier for one session (useful for testing).

## Third-party code
- **Three.js r128** (MIT) is vendored in `public/vendor/three.min.js`; its licence is in `public/vendor/LICENSE-three.txt`.
- All textures are generated procedurally at runtime and all sounds are synthesised – no image or audio assets are used.

## Chat privacy – what it does and does not do
- Messages travel over the same Socket.IO connection as the game and are delivered **only to the members of that room**; a whisper is delivered **only to its sender and recipient** (verified by automated tests).
- The server keeps the last 60 messages **in memory** so reconnecting players get their history; they disappear when the room is closed or the server restarts. Nothing is written to disk or a database.
- It is **not end-to-end encrypted** (the server relays the text) and there is no automatic word filter. Use the host switch and per-player mute for moderation, and serve the game over HTTPS (all common hosts do) so messages are encrypted in transit.

## Limitations
- The 3D board is verified on a software renderer (no real GPU) and by automated geometry tests; real-device frame rates on phones are not measured. The Auto tier and the automatic downgrade exist for exactly this reason – if a phone struggles, choose *Low* or *2D classic* in Settings.
- Game state lives in server memory (no database): restarting the server ends running games.
- One server instance only (no Redis adapter) – fine for free hosting, not for horizontal scaling.
- Google Fonts (Tajawal) is loaded from the web; offline it falls back to the system font.
- Sound uses the browser's WebAudio; browsers only allow it after the first tap.
