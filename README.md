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
- **Realistic board**: beveled tiles, recessed bases, glossy 3D pawns, gold centre medal, metallic frame, footprints, capture and home effects.
- **3D dice** that tumbles and lands on the real server-rolled value.
- **Board rotation**: your colour is always at the bottom-left, like commercial Ludo games (toggle in settings).
- **Bots**: the host can fill empty seats with bots (play alone or with fewer friends). Bots use a simple strategy (capture, finish, stay safe).
- **Turn timer** (off / 15 / 30 / 45 s) with a countdown ring around the avatar. If a player times out twice they are put on auto-pilot until they act again.
- **Room rules** chosen by the host: timer, extra turn on capture, extra turn on reaching home.
- **Auto-move** when there is only one meaningful choice (toggle in settings).
- **Quick chat** phrases (Arabic / English) next to the emoji reactions.
- **Result screen** with ranking and per-player stats (tokens home, captures, sixes) and a personal win counter on the menu.

## Project structure

```
server.js            Authoritative Express + Socket.IO server (rooms, turns, validation)
shared/ludo.js       Rules + board geometry shared by server and client (single source of truth)
public/index.html    All screens (menu, create, join, lobby, game) and modals
public/css/style.css Design system, responsive layouts, animations
public/js/i18n.js    Arabic / English strings, RTL switching
public/js/board.js   SVG board renderer + token animation
public/js/sound.js   Procedural sound effects & music (WebAudio – no audio files, no licensing issues)
public/js/app.js     Client logic and Socket.IO wiring
test/                rules.test.js (geometry & rules), e2e.test.js (real multiplayer games), features.test.js (bots, timer, settings, chat)
```

## Socket.IO protocol (all requests use acknowledgements `{ok, error?}`)

Client → server: `room:create`, `room:peek`, `room:join`, `room:rejoin`, `room:color`, `room:ready`, `room:leave`,
`room:settings`, `room:addBot`, `room:removeBot`, `game:start`, `game:roll`, `game:move {token}`, `game:again`, `game:emoji {emoji}`, `game:chat {id}`.
Server → client: `room:state` (full public state, broadcast after every change), `room:notice`, `game:emoji`, `game:chat`.

The server validates room membership, turn, dice state and move legality; clients can never change game state directly.
Dice are rolled on the server with `crypto.randomInt`.

## Reconnection
Each player gets a secret session id kept in `sessionStorage`. After a refresh or a dropped connection the client
re-joins its seat automatically. If the player on turn is offline, the server auto-plays for them after a grace period
so the match never stalls. Abandoned rooms are cleaned up automatically.

## Limitations
- Game state lives in server memory (no database): restarting the server ends running games.
- One server instance only (no Redis adapter) – fine for free hosting, not for horizontal scaling.
- Google Fonts (Tajawal) is loaded from the web; offline it falls back to the system font.
- Sound uses the browser's WebAudio; browsers only allow it after the first tap.
